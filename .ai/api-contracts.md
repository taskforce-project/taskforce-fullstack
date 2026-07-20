# API Contracts — Frontend ↔ Backend

> **Brain-OS document** · Generated 2026-06-05 · Read-only knowledge artifact for AI agents.
> Maps every frontend API service to its backend controller/endpoint, and flags every mismatch.
> Backend base URL: `http://<host>:8080`. **No `context-path` is configured**, so an endpoint's
> reachable URL is exactly its controller `@RequestMapping` + method path.
> Frontend always prefixes `/api` (via `lib/config/api-routes.ts` or hardcoded service strings).

## How to read this

- **✅ Aligned** — frontend path == backend path; works.
- **❌ Broken (404)** — backend route exists but at a different path than the frontend calls.
- **❌ Broken (undefined)** — frontend imports a route constant that does not exist → JS runtime error.
- All backend paths assume `@RequestMapping` value verbatim (see `backend/tf-api/.../core/api/`).

---

## 1. Controller base paths (ground truth)

| Controller                   | `@RequestMapping`                                                          |  Has `/api`?   |
| ---------------------------- | -------------------------------------------------------------------------- | :------------: |
| AuthController               | `/api/auth`                                                                |       ✅       |
| UserController               | `/api/users`                                                               |       ✅       |
| WorkspaceController          | `/api/workspaces`                                                          |       ✅       |
| ProjectController            | `/api/workspaces/{slug}/projects`                                          |       ✅       |
| IssueController              | `/api/workspaces/{slug}/projects/{projectId}/issues`                       |       ✅       |
| AnalyticsController          | `/api/workspaces/{slug}/analytics`                                         |       ✅       |
| AssistantController          | `/api/workspaces/{slug}/assistant`                                         |       ✅       |
| ProfileController            | `/api/workspaces/{slug}/profile`                                           |       ✅       |
| NotificationController       | `/api/workspaces/{slug}/notifications`                                     |       ✅       |
| MyWorkController             | `/api/workspaces/{slug}` (→ `/my-issues`, `/my-cycles`, `/my-pages`)       |       ✅       |
| RoadmapController            | `/api/workspaces/{slug}/roadmap`                                           |       ✅       |
| WebhookController            | `/api/workspaces/{slug}/webhooks`                                          |       ✅       |
| IntegrationController        | `/api/workspaces/{slug}/integrations/...` + `/api/integrations/*/callback` |       ✅       |
| StripeController             | `/api/stripe`                                                              |       ✅       |
| StripeWebhookController      | `/api/webhooks`                                                            |       ✅       |
| SalesController              | `/api/sales`                                                               |       ✅       |
| FileController (ged)         | `/api/files`                                                               |       ✅       |
| AttachmentController (ged)   | `/api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/attachments` |       ✅       |
| **CycleController**          | `/workspaces/{slug}/projects/{projectId}/cycles`                           | ❌ **missing** |
| **TeamController**           | `/workspaces/{slug}/teams`                                                 | ❌ **missing** |
| **PageController**           | `/workspaces/{slug}/projects/{projectId}/pages`                            | ❌ **missing** |
| **DiscussionController**     | `/workspaces/{slug}/discussions`                                           | ❌ **missing** |
| **ChannelController** (chat) | `/workspaces/{slug}/channels`                                              | ❌ **missing** |

> The 5 controllers without `/api` are unreachable at the URLs the frontend calls. See §4.

---

## 2. Endpoint map by domain

Legend: M = HTTP method. FE service = `frontend/lib/api/<file>`. BE = `backend/.../core/api/<Controller>` (or module).

### Auth — ✅ aligned (`auth-service.ts` ↔ `AuthController` `/api/auth`)

| M    | Path                                                       | FE fn            | BE method        | Status                                         |
| ---- | ---------------------------------------------------------- | ---------------- | ---------------- | ---------------------------------------------- |
| POST | `/api/auth/register`                                       | `register`       | `register`       | ✅                                             |
| POST | `/api/auth/select-plan`                                    | `selectPlan`     | `selectPlan`     | ✅                                             |
| POST | `/api/auth/verify-otp`                                     | `verifyOtp`      | `verifyOtp`      | ✅                                             |
| POST | `/api/auth/resend-otp`                                     | `resendOtp`      | `resendOtp`      | ✅                                             |
| POST | `/api/auth/login`                                          | `login`          | `login`          | ✅                                             |
| POST | `/api/auth/forgot-password`                                | `forgotPassword` | `forgotPassword` | ✅                                             |
| POST | `/api/auth/reset-password`                                 | `resetPassword`  | `resetPassword`  | ✅                                             |
| POST | `/api/auth/refresh` (FE) vs `/api/auth/refresh-token` (BE) | `refreshToken`   | `refreshToken`   | ⚠️ **path mismatch + BE is a stub** (see §4.3) |
| POST | `/api/auth/logout`                                         | `logout`         | `logout`         | ⚠️ BE stub (no token revocation)               |

### User — ✅ (`user-service.ts` ↔ `UserController` `/api/users`)

| GET `/api/users/me` `getMe`; PATCH `/api/users/me` `updateMe`. Avatar upload `POST /api/users/me/avatar` exists on BE (no dedicated FE service fn — used via profile/avatar flow). |

### Workspace — ✅ (`workspace-service.ts` ↔ `WorkspaceController` `/api/workspaces`)

`listWorkspaces` GET `/`, `createWorkspace` POST `/`, `getWorkspaceBySlug` GET `/{slug}`,
`updateWorkspace` PATCH `/{slug}`, `getWorkspaceMembers` GET `/{slug}/members`,
`inviteMember` POST `/{slug}/members/invite`, `updateMemberRole` PATCH `/{slug}/members/{memberId}/role`,
`removeMember` DELETE `/{slug}/members/{memberId}`, `getCurrentWorkspace` GET `/current`. **All ✅.**

### Project — ✅ (`project-service.ts` + `label-service.ts` ↔ `ProjectController`)

CRUD, `/archive`, members, labels. **All ✅.** `label-service.updateLabel` uses `PUT /labels/{labelId}` ↔ BE `PUT updateLabel` ✅.

### Issue — ✅ except roadmap (`issue-service.ts` ↔ `IssueController`)

Issues CRUD, `/statuses` (+`/reorder`), `/types`, `/{id}/comments`, `/{id}/activity`,
`/{id}/smart-assign`, `/{id}/relations`. **All ✅.**
`getScheduledIssues` → `ROADMAP_ROUTES.SCHEDULED(slug)` — **❌ undefined constant** (see §4.2);
intended target `RoadmapController GET /api/workspaces/{slug}/roadmap` exists.

### Analytics — ✅ (`analytics-service.ts` ↔ `AnalyticsController`)

`getAnalyticsKpis` `/kpis`, `getAnalyticsThroughput` `/throughput`, `getAnalyticsBurndown` `/burndown`,
`getAnalyticsCapacity` `/capacity`, `getAiInsights` `/insights`. **All ✅.**

### Notification — ✅ (`notification-service.ts` ↔ `NotificationController`)

`listNotifications`, `countUnread` `/unread-count`, `markAsRead` `/{id}/read`,
`markAllAsRead` `/read-all`, `acknowledgeAll` `/acknowledge-all`. **All ✅.**

### My Work / « Ma file » — ✅ (`MyWorkController`, 2026-07-20)

Vue **cross-projets**. Trois endpoints agrégés sous la même base ; le périmètre est toujours celui des
projets visibles par l'appelant (`ProjectVisibilityGuard.viewableProjectIds`).

| M   | Path                                     | FE                                     | Réponse                               |
| --- | ---------------------------------------- | -------------------------------------- | ------------------------------------- |
| GET | `/api/workspaces/{slug}/my-issues`        | `ISSUE_ROUTES.MY_ISSUES`               | `ApiResponse<List<IssueResponse>>`    |
| GET | `/api/workspaces/{slug}/my-cycles`        | `cycle-service` (`ISSUE_ROUTES.MY_CYCLES`) | `ApiResponse<List<MyWorkCycleResponse>>` |
| GET | `/api/workspaces/{slug}/my-pages`         | `page-service` (`ISSUE_ROUTES.MY_PAGES`)   | `ApiResponse<List<MyWorkPageResponse>>`  |

- `MyWorkCycleResponse = { projectId, projectName, cycle: CycleResponse }` — décompte d'issues groupé en
  **une** requête (`CycleIssueRepository.countByCycleIds`).
- `MyWorkPageResponse = { projectId, projectName, page: PageResponse }` — borné à **50 documents récents**.
- L'enveloppe `{projectId, projectName}` existe parce que `CycleResponse`/`PageResponse` sont normalement
  servis depuis une route **déjà scopée par projet** : sans elle, le client devrait rappeler l'API projet par
  projet, c'est-à-dire exactement le N+1 que ces endpoints suppriment (« Ma file » passait de `3+2N` à 3 appels).
- ⚠️ `MyWorkController` est passé de `@RequestMapping("/api/workspaces/{slug}/my-issues")` à
  `@RequestMapping("/api/workspaces/{slug}")` + `@GetMapping("/my-issues")` : **l'URL externe de `/my-issues`
  est inchangée**.

### Stripe — ✅ paths, partial backend (`stripe-service.ts`)

`createCheckoutSession` POST `/api/stripe/create-checkout`, `getSubscriptionInfo` GET
`/api/stripe/subscription`, `cancelSubscription` POST `/api/stripe/cancel`.
⚠️ Backend `StripeController` confirmed only `GET /verify-session`; the create-checkout / subscription /
cancel handlers + `StripeWebhookController` event handlers are partially stubbed (see [`technical-debt.md`](./technical-debt.md) TD-005).

### Profile — ⚠️ broken import (`profile-service.ts` ↔ `ProfileController`)

`getProfile` GET `/api/workspaces/{slug}/profile` — path ✅, but file has a **broken import**
(`./api-client`) → runtime error. See §4.3.

### Cycle — ❌ BROKEN 404 (`cycle-service.ts` ↔ `CycleController`)

FE calls `/api/workspaces/{slug}/projects/{projectId}/cycles…`; BE serves
`/workspaces/{slug}/projects/{projectId}/cycles…` (no `/api`). **Every cycle endpoint 404s.** See §4.1.

### Team — ❌ BROKEN 404 (`team-service.ts` ↔ `TeamController`)

FE `/api/workspaces/{slug}/teams…`; BE `/workspaces/{slug}/teams…`. **404.** See §4.1.

### Page / Wiki — ❌ BROKEN 404 (`page-service.ts` ↔ `PageController`)

FE `/api/workspaces/{slug}/projects/{projectId}/pages…`; BE `/workspaces/…/pages…`. **404.** See §4.1.

### Discussion — ❌ BROKEN 404 (`discussion-service.ts` ↔ `DiscussionController`)

FE `/api/workspaces/{slug}/discussions…`; BE `/workspaces/{slug}/discussions…`. **404.** See §4.1.

### Messages / Chat — ❌ DOUBLY BROKEN (`message-service.ts` ↔ `ChannelController`)

1. `MESSAGE_ROUTES` is **not defined** in `api-routes.ts` → `undefined` runtime error.
2. Even if defined, `ChannelController` is at `/workspaces/{slug}/channels…` (no `/api`).
   FE expects channel/message paths; BE base is `channels` not `messages`. See §4.1 + §4.2.
   Real-time path: STOMP `/app/channel/{id}/send` → `/topic/channel.{id}` (membership-gated by `StompAuthInterceptor`).

### Integrations (GitHub/Slack/Webhooks) — ❌ BROKEN (`integration-service.ts` ↔ `IntegrationController` + `WebhookController`)

`INTEGRATION_ROUTES` is **not defined** in `api-routes.ts` → `undefined` runtime error on every call.
Backend endpoints **do exist** under `/api/workspaces/{slug}/integrations/...` and
`/api/workspaces/{slug}/webhooks`. Only the FE route registry is missing. See §4.2.

### Attachments — ❌ BROKEN (`attachment-service.ts` ↔ `AttachmentController`)

`ATTACHMENT_ROUTES` is **not defined** in `api-routes.ts` → `undefined` runtime error.
Backend endpoint exists at `/api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/attachments`
(this controller _does_ have `/api`). Only the FE route registry is missing. See §4.2.

### Avatars — ✅ (`FileController` `/api/files/avatars/{userId}`, public; Dicebear fallback)

### Sales — ✅ (`SalesController` `POST /api/sales/inquiry`, public; BE notify-email is a TODO stub)

---

## 3. Defined route groups in `lib/config/api-routes.ts`

Present: `AUTH_ROUTES`, `STRIPE_ROUTES`, `USER_ROUTES`, `WORKSPACE_ROUTES`, `PROJECT_ROUTES`,
`ISSUE_ROUTES`, `CYCLE_ROUTES`, `ANALYTICS_ROUTES`, `NOTIFICATION_ROUTES`, `PROFILE_ROUTES`,
`PAGE_ROUTES`, `TEAM_ROUTES`, `DISCUSSION_ROUTES`.

**Missing (imported but never declared) — confirmed by grep:**
`MESSAGE_ROUTES`, `INTEGRATION_ROUTES`, `ATTACHMENT_ROUTES`, `ROADMAP_ROUTES`.

Minor: the default `API_ROUTES` aggregate object only re-exports 5 of the groups; services import
named groups directly, so the aggregate is effectively dead (low impact).

---

## 4. Detected inconsistencies (authoritative list)

### 4.1 — Missing `/api` prefix on 5 controllers → 404 (HIGH)

`CycleController`, `TeamController`, `PageController`, `DiscussionController`, `ChannelController`
declare base paths **without** `/api`. With **no `context-path` configured** (verified in
`application.yml`, `application-dev.yml`, `application-prod.yml`), these are served at `/workspaces/…`
while the frontend calls `/api/workspaces/…`. **Result:** Cycles, Teams, Pages, Discussions, and Chat
features fail with 404. Root cause: a stale assumption (see `CorsConfig.java:65` comment
`"avec context-path=/api"`) that was never (or no longer) configured; most controllers were fixed to
add `/api` explicitly, these 5 were missed. → [`known-issues.md`](./known-issues.md) **KI-001**.

### 4.2 — Undefined frontend route constants → runtime error (HIGH)

`message-service.ts` (`MESSAGE_ROUTES`), `integration-service.ts` (`INTEGRATION_ROUTES`),
`attachment-service.ts` (`ATTACHMENT_ROUTES`), and `issue-service.ts::getScheduledIssues`
(`ROADMAP_ROUTES`) import constants absent from `api-routes.ts`. Calling them throws
`Cannot read properties of undefined`. → KI-002.

### 4.3 — `profile-service.ts` broken import (MEDIUM)

Line 1: `import apiClient from "./api-client";` — module `./api-client` does not exist; the real
client is the **named** export `apiClient` from `./client`. `getProfile()` will fail at runtime.
→ KI-003.

### 4.4 — Auth refresh path/contract mismatch (MEDIUM)

Frontend `AUTH_ROUTES.REFRESH_TOKEN = /api/auth/refresh`; backend method is mapped to
`/api/auth/refresh-token` **and** is an unimplemented TODO. Refresh-on-401 cannot succeed. → KI-004.

---

## 5. Coverage summary

| Domain                                                                                                       | FE↔BE status                   |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Auth, User, Workspace, Project, Issue (core), Analytics, Notification, Profile(path), Labels, Sales, Avatars | ✅ aligned                     |
| Cycle, Team, Page, Discussion, Chat                                                                          | ❌ 404 (missing `/api`)        |
| Messages, Integrations, Attachments, Roadmap                                                                 | ❌ undefined FE route constant |
| Profile import, Auth refresh, Stripe write-paths                                                             | ⚠️ runtime/stub issues         |

> When wiring a new endpoint: (1) add the controller path **with `/api`**, (2) add the constant to
> `api-routes.ts`, (3) consume it in the service, (4) read `response.data.data` (envelope).
