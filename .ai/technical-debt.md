# Technical Debt — TaskForce Fullstack

> **Brain-OS document** · Generated 2026-06-05 · Read-only knowledge artifact for AI agents.
> Catalogue of bugs, inconsistencies, dead code, missing endpoints, broken routes, and residual
> mock data. **Findings only — no fixes applied.** Each item is verified against source unless marked
> _(reported)_. Prioritized, scored issues are in [`known-issues.md`](./known-issues.md); this file is
> the exhaustive technical inventory.

Severity legend: 🔴 blocker · 🟠 high · 🟡 medium · 🟢 low.

---

## A. Broken routes (frontend → backend)

### TD-001 🔴 Five controllers miss the `/api` prefix → 404

`CycleController`, `TeamController`, `PageController`, `DiscussionController`, `ChannelController`
map to `/workspaces/…` (no `/api`). **No `server.servlet.context-path` is configured** (verified in
`application.yml`, `-dev`, `-prod`), so the frontend's `/api/workspaces/…` calls 404.

- Evidence: `@RequestMapping` grep (these 5 lack `/api`; the other 16 controllers have it).
- Misleading breadcrumb: `shared/config/CorsConfig.java:65` comment `"avec context-path=/api"`.
- Impact: Cycles, Teams, Pages, Discussions, Chat are non-functional end-to-end.
- Files: `core/api/{Cycle,Team,Page,Discussion}Controller.java`, `modules/chat/api/ChannelController.java`.

### TD-002 🟠 Missing frontend route constants → `undefined` runtime error

Imported but **not declared** in `frontend/lib/config/api-routes.ts`:
`MESSAGE_ROUTES`, `INTEGRATION_ROUTES`, `ATTACHMENT_ROUTES`, `ROADMAP_ROUTES`.

- Consumers: `message-service.ts`, `integration-service.ts`, `attachment-service.ts`,
  `issue-service.ts::getScheduledIssues`.
- Effect: any call throws `Cannot read properties of undefined (reading '…')`.
- Note: backend endpoints for integrations, attachments, and roadmap **exist** (with `/api`); only
  the FE registry entries are missing. For messages the backend is also mispathed (TD-001).

### TD-003 🟡 `profile-service.ts` imports a nonexistent module

Line 1: `import apiClient from "./api-client";`. There is no `api-client`; the client is the **named**
export `apiClient` in `./client`. `getProfile()` fails at runtime. Every other service imports
`{ apiClient } from "@/lib/api/client"` (or `"../api/client"`) correctly.

### TD-004 🟡 Auth refresh path & contract mismatch

FE `AUTH_ROUTES.REFRESH_TOKEN = "/api/auth/refresh"`; BE `AuthController.refreshToken` is mapped to
`/api/auth/refresh-token`. Combined with TD-007 (refresh is an unimplemented stub), the
401→refresh→retry flow in `client.ts` cannot succeed; expired sessions hard-redirect to login.

---

## B. Stubbed / incomplete endpoints (backend)

### TD-005 🟠 Stripe webhook & write handlers stubbed

`StripeWebhookController` handlers for `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_succeeded`, `invoice.payment_failed` are **log-only** (no DB state change). Subscription
lifecycle after initial checkout is not reflected in the app. `StripeController` confirmed to expose only
`GET /verify-session`; FE calls `create-checkout` / `subscription` / `cancel` — verify these handlers
exist/are wired before relying on them.

### TD-006 🟡 Sales inquiry: no notification

`modules/sales/service/SalesService.java` — `// TODO: Envoyer email de confirmation + notification à
l'équipe sales`. Enterprise leads are persisted but no email/alert is sent.

### TD-007 🟡 Auth refresh-token & logout not implemented

`AuthController` — `// TODO: Implémenter le rafraîchissement du token` and
`// TODO: Extraire le userId du token et révoquer les refresh tokens`. `refreshToken` and `logout`
do not actually refresh or revoke. `JwtService` exists but the refresh feature is unfinished.

### TD-008 🟡 Assistant "streaming" is simulated

`AssistantController` chunks the full LLM response by groups of ~5 words to _mimic_ SSE streaming
rather than streaming tokens from Groq. Functional but not true streaming (latency = full completion).

---

## C. Dead / vestigial / mock

### TD-009 🟡 Residual chat mock data

`frontend/components/messages/data.ts` holds static channel/message sample data. With the chat API
broken (TD-001/TD-002), the messages UI likely renders this mock content. Remove once chat is wired.

### TD-010 🟡 Python AI service is a stub, superseded by Groq-direct

`ai-service/app/main.py`: `/v1/embeddings` returns deterministic SHA256-hash **16-dim** vectors (no
model); `/v1/smart-assign/*` use hand-weighted formulas. `TODO.md` marks it **"Remplacé par Groq
direct"** — prod AI is `core/service/GroqService.java`. The service, its Dockerfile, and the
`AI_SERVICE_URL`/`EMBEDDING_MODEL` env wiring are effectively dead in production. Keep as legacy or remove.

### TD-011 🟢 `API_ROUTES` aggregate export is dead

`api-routes.ts` exports an `API_ROUTES` object aggregating only 5 of 13+ groups; services import named
groups directly, so the aggregate is unused. Harmless but misleading.

### TD-012 🟢 Hardcoded avatar object key

`modules/ged/api/FileController.java` builds `"avatars/" + userId + "/avatar"` inline. Works, but the
key convention is not centralized/configurable.

---

## D. Incomplete features (frontend)

### TD-013 🟡 `team-store` incomplete

`frontend/lib/store/team-store.ts` is a thin/incomplete implementation relative to other stores
(no full CRUD parity). Combined with TD-001, Teams is non-functional.

### TD-014 🟢 Command-palette "Create new issue" is a placeholder

`frontend/components/command-palette.tsx` — the "Create new issue" action fires
`toast.info("New issue dialog coming soon")` instead of opening the create-issue dialog.

### TD-015 🟢 `[ws]/agents` page is a feature placeholder

AI "agents" route exists as a shell; assistant runtime is partially via local adapter (per `TODO.md`).

---

## E. Operational / config debt

### TD-016 🟡 AI Insights not cached

`AnalyticsController /insights` generates on demand via Groq each call (`TODO.md`: "no caching yet").
`ai_runs`/`insight_snapshots` tables (V35) exist but reuse isn't implemented → latency + Groq quota burn.

### TD-017 🟡 No quota/timeout guards on Groq / ai-service

`TODO.md` lists missing resilience guards (quota, timeout) around Groq and the Python service.

### TD-018 🟡 No feature flags for AI

`TODO.md` notes desired toggles (`enabled`, `smartAssign`, `assistant`, `insights`) not yet present;
AI is gated only by presence of `GROQ_API_KEY`.

### TD-019 🟡 Stale `context-path` comment in `CorsConfig`

`CorsConfig.java:65` claims `context-path=/api`; not configured. This stale assumption is the likely
root cause of TD-001 and will mislead future readers. (Comment only — documentation/cleanup.)

### TD-020 🟢 Possible actuator health path mismatch _(reported)_

Dev compose healthcheck targets `/api/actuator/health`, but with no context-path actuator lives at
`/actuator/health`. Healthchecks may pass only because non-200 (401/404) is tolerated. Verify before
relying on it.

---

## F. Testing & QA debt (from `TODO.md`)

### TD-021 🟠 Manual QA pending (QA.1–QA.6)

Smart Assign, Assistant streaming, AI Insights consistency, chat realtime post-hardening, attachment
CRUD + MinIO signed URLs + scope, avatar upload/display — all flagged "manual smoke test needed".

### TD-022 🟠 Automated tests pending (T.1–T.6)

Missing: `SmartAssignService` units, `ai-service` pytest, IA controllers, FE SmartAssignPanel/assistant
(Vitest+RTL), pgvector/migration integration, E2E Playwright on IA flows.

---

## Summary counts

| Category                | Items                      |
| ----------------------- | -------------------------- |
| Broken routes           | TD-001…004 (1🔴, 1🟠, 2🟡) |
| Stubbed endpoints       | TD-005…008 (1🟠, 3🟡)      |
| Dead / vestigial / mock | TD-009…012 (3🟡, 2🟢)      |
| Incomplete FE features  | TD-013…015 (1🟡, 2🟢)      |
| Operational/config      | TD-016…020 (4🟡, 1🟢)      |
| Testing/QA              | TD-021…022 (2🟠)           |

→ Triaged & scored view: [`known-issues.md`](./known-issues.md). Contract detail: [`api-contracts.md`](./api-contracts.md).
