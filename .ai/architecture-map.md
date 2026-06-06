# Architecture Map — TaskForce Fullstack

> **Brain-OS document** · Generated 2026-06-05 · Read-only knowledge artifact for AI agents.
> Purpose: give any agent a complete mental model of the system in one read, so it can locate
> code and reason about impact without re-scanning the whole repository.
> **This file documents reality, not intent.** Where reality diverges from intent it is flagged
> and cross-referenced to [`technical-debt.md`](./technical-debt.md) and [`known-issues.md`](./known-issues.md).

---

## 1. System at a glance

TaskForce is a **multi-tenant project-management SaaS** (Linear/Jira-style) with workspaces →
projects → issues/cycles, plus chat, discussions, wiki pages, analytics, AI assist, billing, and
external integrations. It is a **polyrepo-in-a-monorepo**: four deployable apps + supporting infra.

| Layer               | Tech                                          | Path                                    | Deployable                                  |
| ------------------- | --------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Landing page        | Astro 5.x                                     | `landing-page/`                         | `landing` (dev 18081→4321)                  |
| Frontend (app)      | Next.js 16.1 · React 19.2 · TS 5 · Tailwind 4 | `frontend/`                             | `frontend` (3000)                           |
| Backend API         | Spring Boot 4.0 · Java 21 · Maven             | `backend/tf-api/`                       | `backend` (8080, debug 5005)                |
| AI service          | FastAPI 0.115 · Python 3.12                   | `ai-service/`                           | `ai-service` (8000) — **vestigial, see §6** |
| Database            | PostgreSQL 18 + `pgvector`                    | (container)                             | `postgres` (5432)                           |
| Identity            | Keycloak (26 prod / custom dev)               | `backend/tf-api/keycloak*`, `keycloak/` | `keycloak` (8180→8080)                      |
| Object store        | MinIO (S3)                                    | (container)                             | `minio` (9000 API / 9001 console)           |
| Message broker      | RabbitMQ 4 + STOMP relay                      | (container)                             | `rabbitmq` (5672 / 15672 / 61613 STOMP)     |
| Reverse proxy       | Nginx (prod only)                             | `nginx/`                                | `nginx` (80/443)                            |
| Admin/observability | pgAdmin · SigNoz (optional)                   | `docker-compose.tools.yml`              | profiles                                    |

**Auth model:** OAuth2/OIDC via Keycloak. Backend is a JWT **resource server** (RS256, validated
against Keycloak JWKS). Frontend stores `accessToken`/`refreshToken` and auto-refreshes on 401.
Dev can bypass auth with `keycloak.enabled=false`.

---

## 2. Global topology

```
                                  ┌──────────────┐
                          OIDC    │   Keycloak   │  (identity, JWT issuer)
                       ┌─────────▶│   :8180      │
                       │          └──────────────┘
┌──────────┐   HTTPS   │   ┌───────────────────────────┐   JDBC   ┌────────────────────┐
│ Browser  │──────────▶├──▶│  Frontend (Next.js :3000) │          │ PostgreSQL 18      │
│          │           │   │  - Axios client            │          │ + pgvector         │
│          │  WS/STOMP │   │  - Zustand stores          │          │   :5432            │
└──────────┘           │   │  - keycloak-js, STOMP.js   │          └────────▲───────────┘
                       │   └─────────────┬─────────────┘                   │
                       │                 │ REST  /api/**                    │
                       │                 ▼                                  │
                       │   ┌───────────────────────────┐   JDBC            │
                       │   │  Backend (Spring Boot)     │───────────────────┘
                       │   │  :8080  /api/**            │
                       │   │  core + modules + shared   │
                       │   └───┬───┬───┬───┬───┬────────┘
                       │       │   │   │   │   │
        STOMP 61613 ───┘       │   │   │   │   └──▶ SMTP / Mailtrap (OTP, mail)
        ┌──────────────┐       │   │   │   └──────▶ MinIO :9000 (avatars, attachments)
        │ RabbitMQ     │◀──────┘   │   └──────────▶ Groq API (LLM: smart-assign, assistant, insights)
        │ STOMP relay  │           └──────────────▶ Stripe (checkout, subscriptions, webhooks)
        └──────────────┘                            GitHub / Slack OAuth (integrations)
```

Real-time: backend relays STOMP through RabbitMQ (`/topic/*`, `/queue/*`, `/user/*`), falling back
to an in-memory `SimpleBroker` if RabbitMQ is down. Frontend connects via `@stomp/stompjs` (SockJS
fallback at `/ws-sockjs`).

---

## 3. Frontend architecture (`frontend/`)

**App Router** (`app/`), route groups:

- `app/(protected)/[workspace]/…` — the authenticated product, scoped by workspace slug.
- `app/auth/…` — login, 3-step register (info → plan → OTP verification), forgot-password.
- `app/payment/{success,cancel}` — Stripe return URLs.
- `app/api/avatar/route.ts` — Next route handler (avatar proxy).

**Layers (top → bottom):**

1. **Pages** (`app/**/page.tsx`) — server/client components per route.
2. **Components** (`components/`) — `ui/` (shadcn/Radix primitives), feature folders
   (`messages/`, `pricing/`, `sales/`, `smart-assign/`, `inbox/`, `my-work/`, `dialogs/`,
   `sheets/`, `layout/`, `editor/` TipTap, `effects/`).
3. **State** (`lib/store/*.ts`) — **Zustand** stores, one per domain (see [`module-map.md`](./module-map.md) §3).
4. **API services** (`lib/api/*-service.ts`) — typed wrappers over the REST API.
5. **HTTP client** (`lib/api/client.ts`) — Axios instance: SSR base `http://backend:8080`,
   CSR base `http://localhost:8080` (env `NEXT_PUBLIC_API_URL[_SSR]`), bearer injection,
   401→refresh→retry, toast-based error mapping.
6. **Route registry** (`lib/config/api-routes.ts`) — central endpoint path constants
   (**incomplete** — see [`api-contracts.md`](./api-contracts.md)).
7. **Cross-cutting**: `lib/contexts/auth-context.tsx`, `lib/hooks/use-stomp.ts`, `lib/i18n/`
   (`constants_fr.ts` / `constants_en.ts`), `lib/auth/register-storage.ts`.

**Data flow:** Page → store action → service fn → Axios client → `/api/**` → (response) → store → re-render.
Real-time updates arrive via `use-stomp` → store mutation.

---

## 4. Backend architecture (`backend/tf-api/`)

Layered, module-oriented Spring Boot. Package root `com.taskforce.tf_api`.

```
com.taskforce.tf_api
├── core/          # primary domain (auth, workspace, project, issue, cycle, team, analytics, …)
│   ├── api/         REST controllers (18)
│   ├── service/     business logic (~25 services)
│   ├── repository/  Spring Data JPA repos
│   ├── model/       JPA entities (~35)
│   ├── dto/         request/ + response/
│   └── enums/       (19 enums)
├── modules/       # bounded features (own api/domain/service/repository/dto)
│   ├── chat/        channels + messages + WebSocket
│   ├── ged/         document/attachment mgmt + MinIO + avatar serving
│   └── sales/       enterprise lead capture
└── shared/        # cross-cutting (NO domain logic)
    ├── config/      Cors, Jpa, Keycloak, Mail, Minio, OAuth2, OpenApi, Otp, Stripe,
    │                WebSocket, Groq, StompAuthInterceptor
    ├── security/    SecurityConfig, JwtDecoderConfig, JwtIdentityResolver
    ├── audit/       AuditableEntity (created/updated by/at)
    ├── dto/         ApiResponse<T>, ErrorResponse, PageResponse<T>
    └── exception/   GlobalExceptionHandler, BusinessException, ResourceNotFoundException, ForbiddenException
```

**Dependency rule (from `backend/tf-api/ARCHITECTURE.md`):** `shared ← core ← modules`. Modules may
depend on core/shared; core depends on shared; **never the reverse**.

**Request lifecycle:** `SecurityConfig` (2 chains: public + JWT) → Controller (`@RequestMapping`) →
Service (authorization: caller must be `WorkspaceMember`/`ProjectMember`; role checks via
`WorkspaceRole`/`ProjectRole`) → Repository → PostgreSQL. Errors normalized by
`GlobalExceptionHandler` into `{success,data,message,statusCode}`.

**Response envelope:** `ApiResponse<T>` = `{ success, data, message, statusCode }`. Frontend services
consistently read `res.data.data`.

**Persistence:** Hibernate `ddl-auto=validate` + **Flyway** migrations `V1`–`V35`
(`src/main/resources/db/migration/`). Schema is migration-owned; entities must match. Migration
timeline in [`module-map.md`](./module-map.md) §4.

**Security chains** (`shared/security/SecurityConfig.java`):

- Public: `/api/auth/**`, `/api/sales/**`, `/api/stripe/**`, `/api/webhooks/**`,
  `/api/integrations/*/callback`, `/api/files/**`, `/ws/**`, `/actuator/**`, `/swagger-ui/**`.
- Protected: everything else → `oauth2ResourceServer` JWT validation. CSRF off, stateless sessions.

> ⚠️ **No `server.servlet.context-path` is set** (verified in all three `application*.yml`). A
> comment in `shared/config/CorsConfig.java:65` references `context-path=/api` but it is **not
> configured**. Controllers must therefore each include the `/api` prefix explicitly — 5 do not.
> See [`api-contracts.md`](./api-contracts.md) §4 and [`known-issues.md`](./known-issues.md) KI-001.

---

## 5. Module relationships

```
                 ┌───────── Workspace (tenant root) ─────────┐
                 │                                            │
        ┌────────┴────────┐        ┌──────────┐      ┌────────┴───────┐
        │ Project          │        │ Team      │      │ Discussion      │
        │  ├ Issue ◀──────────┐     │  └ Member │      │ (forum)         │
        │  │  ├ Comment       │     └──────────┘      └─────────────────┘
        │  │  ├ Activity      │                       ┌─────────────────┐
        │  │  ├ Relation      │     ┌──────────┐      │ Notification     │
        │  │  ├ Attachment ───┼────▶│ GED/MinIO│      │ (inbox)          │
        │  │  └ GitHubLink ───┼──┐  └──────────┘      └─────────────────┘
        │  ├ Cycle (sprint) ──┘  │  ┌──────────┐      ┌─────────────────┐
        │  ├ Page (wiki)         └─▶│ Integr.  │      │ Chat: Channel    │
        │  └ Label                  │ GitHub/  │      │   └ ChatMessage   │
        └────────────────────────  │ Slack/WH │      │ (STOMP realtime)  │
                                    └──────────┘      └─────────────────┘
   Cross-cutting: Analytics (reads Issue/Cycle), Assistant+SmartAssign+Insights (Groq),
   Auth/User/Subscription (Keycloak+Stripe), Sales (standalone lead capture).
```

Functional domains and their code locations are detailed in [`module-map.md`](./module-map.md).

---

## 6. Infrastructure & deployment

**Compose files (root):**

- `docker-compose.dev.yml` — full dev stack: postgres(pgvector), keycloak(custom build),
  backend(hot reload, mounts `src`), frontend, ai-service, landing, rabbitmq, minio, pgadmin.
- `docker-compose.prod.yml` — postgres:16-alpine, keycloak 23, backend(temurin jre), frontend, nginx.
- `docker-compose.tools.yml` — optional profiles: `observability` (SigNoz: zookeeper, clickhouse,
  otel-collector, UI :3301) and one-shot security scanners (`trivy`, `semgrep`).
- `docker-compose.yml` — base/shared definition. `docker.ps1` / `Makefile` — orchestration helpers.

**CI/CD (`.github/workflows/`):** `backend-tests.yml`, `frontend-tests.yml`, `landing-tests.yml`
(per-app test/lint/build on PR & push), `release.yml` (build+push images to GHCR),
`version-management.yml` (semver bump on merge to main), `sync-readme-badges.yml`.

**AI service caveat (important for agents):** `ai-service/app/main.py` is a **stub**. Its
`/v1/embeddings` returns deterministic SHA256-hash 16-dim vectors (no ML model); smart-assign
scoring is a hand-weighted formula. Per `TODO.md` it is **"Remplacé par Groq direct"** — production
AI runs in Java (`core/service/GroqService.java`) calling Groq's API directly
(`llama-3.1-8b-instant` for smart-assign, `llama-3.3-70b-versatile` for assistant). Treat
`ai-service` as legacy/optional; the backend does not require it in prod.
See [`technical-debt.md`](./technical-debt.md) TD-010.

**External dependencies:** Keycloak (identity), Stripe (billing), Groq (LLM), GitHub & Slack
(OAuth integrations), MinIO (storage), RabbitMQ (realtime), SMTP/Mailtrap (email).

---

## 7. Where to look (agent quick-index)

| I need to…            | Go to                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/trace an endpoint | backend `core/api/*Controller.java` + frontend `lib/api/*-service.ts` + `lib/config/api-routes.ts`; map in [`api-contracts.md`](./api-contracts.md) |
| Change DB schema      | new `Vnn__*.sql` in `db/migration/` + matching entity in `model/`                                                                                   |
| Touch a domain        | [`module-map.md`](./module-map.md) for owning files                                                                                                 |
| Understand auth       | `shared/security/`, `core/service/Auth*`, `Keycloak*`, frontend `lib/contexts/auth-context.tsx`                                                     |
| Real-time/chat        | `modules/chat/`, `shared/config/WebSocketConfig`, `StompAuthInterceptor`, frontend `lib/hooks/use-stomp.ts`                                         |
| Billing               | `core/api/Stripe*Controller`, `core/service/StripeService`, frontend `lib/api/stripe-service.ts`                                                    |
| AI features           | `core/service/{Groq,Assistant,SmartAssign,Analytics}Service`, `docs/phase4-ia-architecture.md`                                                      |
| Known broken things   | [`known-issues.md`](./known-issues.md)                                                                                                              |
