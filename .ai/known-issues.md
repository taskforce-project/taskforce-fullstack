# Known Issues — Triage Board

> **Brain-OS document** · Generated 2026-06-05 · Read-only knowledge artifact for AI agents.
> Prioritized, scored view of the problems catalogued in [`technical-debt.md`](./technical-debt.md).
> Each issue: **Priority · Impact · Effort · Confidence**, with the fix locus (not applied here).
> Effort scale: S ≤2h · M ½–1d · L 1–3d · XL >3d. Confidence = how sure the finding is true.

## Priority queue (do in this order)

| ID     | Priority | Title                                                                        | Impact                                       | Effort | Conf. |
| ------ | :------: | ---------------------------------------------------------------------------- | -------------------------------------------- | :----: | :---: |
| KI-001 |  🔴 P0   | 5 controllers miss `/api` prefix → Cycles/Teams/Pages/Discussions/Chat 404   | Whole feature areas dead                     |   M    | High  |
| KI-002 |  🟠 P1   | Missing FE route constants → Messages/Integrations/Attachments/Roadmap crash | 4 features throw at runtime                  |   S    | High  |
| KI-003 |  🟠 P1   | `profile-service.ts` broken import                                           | Profile page errors                          |   S    | High  |
| KI-004 |  🟠 P1   | Auth refresh path mismatch + unimplemented                                   | Sessions can't refresh → forced re-login     |   M    | High  |
| KI-005 |  🟠 P1   | Stripe subscription/invoice webhooks stubbed                                 | Billing state drifts from Stripe             |   L    | High  |
| KI-006 |  🟡 P2   | `team-store` incomplete                                                      | Teams UI non-functional even if KI-001 fixed |   M    |  Med  |
| KI-007 |  🟡 P2   | AI Insights not cached + no Groq quota/timeout guards                        | Latency + quota exhaustion                   |   M    | High  |
| KI-008 |  🟡 P2   | Sales inquiry sends no email/notification                                    | Leads silently captured, team unaware        |   S    | High  |
| KI-009 |  🟡 P2   | Assistant streaming is simulated                                             | Perceived latency; not token-stream          |   M    | High  |
| KI-010 |  🟡 P2   | Manual QA (QA.1–QA.6) & automated tests (T.1–T.6) pending                    | Release risk, regressions                    |   XL   | High  |
| KI-011 |  🟢 P3   | Residual chat mock data (`messages/data.ts`)                                 | Fake content shown until chat wired          |   S    |  Med  |
| KI-012 |  🟢 P3   | `ai-service` Python stub vestigial (Groq-direct in prod)                     | Dead service, ops confusion                  |   M    | High  |
| KI-013 |  🟢 P3   | Command-palette "Create new issue" placeholder                               | Minor UX gap                                 |   S    | High  |
| KI-014 |  🟢 P3   | No AI feature flags                                                          | Ops can't toggle AI features                 |   M    | High  |
| KI-015 |  🟢 P3   | Stale `context-path=/api` comment + actuator healthcheck path                | Misleads readers; healthcheck noise          |   S    |  Med  |

---

## Details

### KI-001 🔴 — `/api` prefix missing on 5 controllers

- **Symptom:** Frontend calls to cycles, teams, pages, discussions, and chat return 404.
- **Root cause:** No `server.servlet.context-path` is set, yet `CycleController`, `TeamController`,
  `PageController`, `DiscussionController`, `ChannelController` omit `/api` in `@RequestMapping`.
- **Fix locus:** add `/api` to those 5 `@RequestMapping` values **or** set `context-path: /api` and
  strip `/api` from the other 16 controllers (the former is lower-risk).
- **Verify:** hit `GET /api/workspaces/{slug}/teams` returns 200, not 404.
- Ref: TD-001, [`api-contracts.md`](./api-contracts.md) §4.1.

### KI-002 🟠 — Undefined frontend route constants

- **Symptom:** `Cannot read properties of undefined` when opening Messages, Integrations settings,
  uploading attachments, or loading the Roadmap.
- **Root cause:** `MESSAGE_ROUTES`, `INTEGRATION_ROUTES`, `ATTACHMENT_ROUTES`, `ROADMAP_ROUTES`
  imported by services but never declared in `frontend/lib/config/api-routes.ts`.
- **Fix locus:** declare the four route groups (paths must include `/api`; align to backend bases —
  integrations/attachments/roadmap already have `/api` on BE; messages also needs KI-001).
- Ref: TD-002, [`api-contracts.md`](./api-contracts.md) §3, §4.2.

### KI-003 🟠 — `profile-service.ts` bad import

- **Symptom:** `getProfile()` throws on import resolution / undefined client.
- **Fix locus:** `frontend/lib/api/profile-service.ts:1` → `import { apiClient } from "./client";`.
- Ref: TD-003.

### KI-004 🟠 — Auth refresh broken

- **Symptom:** On token expiry, `client.ts` 401→refresh→retry fails; user is logged out.
- **Root cause:** FE posts to `/api/auth/refresh`; BE maps `/api/auth/refresh-token` **and** the handler
  is an unimplemented TODO (no rotation/revocation). `logout` likewise doesn't revoke.
- **Fix locus:** align path + implement refresh/revoke in `AuthController`/`AuthService`/`JwtService`.
- Ref: TD-004, TD-007.

### KI-005 🟠 — Stripe lifecycle webhooks stubbed

- **Symptom:** Subscription upgrades/cancellations/payment failures don't update app state.
- **Fix locus:** implement handlers in `StripeWebhookController` (subscription.updated/deleted,
  invoice.payment_succeeded/failed) → update `Subscription`/`SubscriptionHistory`. Confirm
  `create-checkout`/`subscription`/`cancel` handlers exist on `StripeController`.
- Ref: TD-005.

### KI-006 🟡 — `team-store` incomplete

- **Fix locus:** `frontend/lib/store/team-store.ts` — bring to CRUD parity with peers; depends on KI-001.
- Ref: TD-013.

### KI-007 🟡 — AI Insights caching & Groq guards

- **Fix locus:** reuse `ai_runs`/`insight_snapshots` (V35) in `AnalyticsService`; add timeout/quota
  guards around `GroqService`.
- Ref: TD-016, TD-017.

### KI-008 🟡 — Sales inquiry notification

- **Fix locus:** `modules/sales/service/SalesService.java` — wire `EmailService` + team alert.
- Ref: TD-006.

### KI-009 🟡 — Simulated assistant streaming

- **Fix locus:** `AssistantController`/`AssistantService` — stream Groq SSE tokens instead of
  post-hoc word chunking.
- Ref: TD-008.

### KI-010 🟡 — QA & test coverage

- **Scope:** QA.1–QA.6 (manual smoke) and T.1–T.6 (units/integration/E2E) from `TODO.md`.
- **Effort:** XL — track as an epic, not a single change.
- Ref: TD-021, TD-022.

### KI-011 🟢 — Chat mock data

- **Fix locus:** remove/replace `frontend/components/messages/data.ts` once chat API works (KI-001/002).
- Ref: TD-009.

### KI-012 🟢 — Vestigial Python AI service

- **Decision needed:** keep `ai-service/` as documented-legacy or delete (and drop `AI_SERVICE_URL`,
  `EMBEDDING_MODEL`, its Dockerfile/compose entry). Prod uses Groq-direct in Java.
- Ref: TD-010, [`architecture-map.md`](./architecture-map.md) §6.

### KI-013 🟢 — Command-palette placeholder

- **Fix locus:** `frontend/components/command-palette.tsx` — wire to create-issue dialog.
- Ref: TD-014.

### KI-014 🟢 — AI feature flags

- **Fix locus:** introduce `enabled`/`smartAssign`/`assistant`/`insights` toggles (config + gating).
- Ref: TD-018.

### KI-015 🟢 — Stale comment & actuator path

- **Fix locus:** correct/remove `CorsConfig.java:65` comment; verify dev compose healthcheck path
  (`/actuator/health` vs `/api/actuator/health`).
- Ref: TD-019, TD-020.

---

## Notes for future agents

- **Confirmed via source** (high confidence): KI-001, 002, 003, 004, 008, 009, 012.
- **Reported / verify before acting** (medium): KI-006 (store depth), KI-011 (mock still rendered?),
  KI-015 (actuator path tolerated by healthcheck).
- Fixing KI-001 + KI-002 together unblocks the largest surface (5+ feature areas) for the least effort
  — highest ROI. Do them first, then re-run [`api-contracts.md`](./api-contracts.md) checks.
- This board reflects the repo at 2026-06-05 on branch `feat/dashboard`; re-verify line references
  before editing, as they may have shifted.
