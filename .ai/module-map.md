# Module Map — Functional Domains & Dependencies

> **Brain-OS document** · Generated 2026-06-05 · Read-only knowledge artifact for AI agents.
> Cartography of functional domains across the stack and how they depend on each other.
> Use this to find the owning files for any feature before editing.

---

## 1. Domain catalogue (full vertical slices)

Each domain spans: backend controller → service → repository → entity, frontend service → store → routes.

| Domain                   | Backend (core/api · service · model)                                                                                                                                           | Frontend (lib/api · store)                                                 | Routes (`app/`)                                                 |                   Health                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------- | :-----------------------------------------: |
| **Auth & Registration**  | `AuthController` · `AuthService`, `KeycloakAuthService`, `KeycloakService`, `OtpService`, `EmailService`, `JwtService` · `User`,`OtpVerification`,`RefreshToken`               | `auth-service` · `auth-context`                                            | `auth/*`                                                        |         ✅ (refresh/logout stubbed)         |
| **Billing/Subscription** | `StripeController`,`StripeWebhookController` · `StripeService` · `Subscription`,`SubscriptionHistory`                                                                          | `stripe-service` · —                                                       | `auth/register/plan`, `payment/*`                               |         ⚠️ webhook handlers stubbed         |
| **User profile**         | `UserController`,`ProfileController` · `UserService`,`ProfileService` · `User`                                                                                                 | `user-service`,`profile-service` · `user-store`,`profile-store`            | `[ws]/profile`, `[ws]/members/[id]`                             |        ⚠️ profile-service import bug        |
| **Workspace (tenant)**   | `WorkspaceController` · `WorkspaceService` · `Workspace`,`WorkspaceMember`                                                                                                     | `workspace-service` · `workspace-store`                                    | `[ws]/settings`, `[ws]/members`, `(protected)/page`             |                     ✅                      |
| **Project**              | `ProjectController` · `ProjectService` · `Project`,`ProjectMember`,`ProjectLabel`                                                                                              | `project-service`,`label-service` · `project-store`,`label-store`          | `[ws]/projects/*`                                               |                     ✅                      |
| **Issue tracking**       | `IssueController` · `IssueService`,`SmartAssignService` · `Issue`,`IssueStatus`,`IssueType`,`IssueComment`,`IssueActivity`,`IssueRelation`,`IssueSequenceCounter`              | `issue-service` · `issue-store`                                            | `[ws]/issues`, `[ws]/projects/[id]/issues/*`, `backlog`, `list` |                     ✅                      |
| **Cycles (sprints)**     | `CycleController` · `CycleService` · `Cycle`,`CycleIssue`                                                                                                                      | `cycle-service` · `cycle-store`                                            | `[ws]/cycles`, `projects/[id]/cycles/*`                         |           ❌ 404 (missing `/api`)           |
| **Roadmap**              | `RoadmapController` · `IssueService` · `Issue`                                                                                                                                 | `issue-service.getScheduledIssues` · `issue-store`                         | `[ws]/roadmap`                                                  |            ❌ FE route undefined            |
| **Teams**                | `TeamController` · `TeamService` · `Team`,`TeamMember`                                                                                                                         | `team-service` · `team-store`                                              | `[ws]/teams`                                                    |          ❌ 404 + store incomplete          |
| **Pages (wiki)**         | `PageController` · `PageService` · `Page`                                                                                                                                      | `page-service` · `page-store`                                              | `projects/[id]/pages/*`, `my-work/pages`                        |           ❌ 404 (missing `/api`)           |
| **Discussions (forum)**  | `DiscussionController` · `DiscussionService` · `Discussion`                                                                                                                    | `discussion-service` · `discussion-store`                                  | `[ws]/discussions`                                              |           ❌ 404 (missing `/api`)           |
| **Chat (realtime)**      | `ChannelController`,`ChatWebSocketController` · `ChannelService`,`ChatMessageService` · `Channel`,`ChatMessage`,`ChannelMember`                                                | `message-service` · `message-store` (+ `components/messages/data.ts` mock) | `[ws]/messages`                                                 | ❌ 404 + FE route undefined + mock fallback |
| **Notifications/Inbox**  | `NotificationController` · `NotificationService` · `Notification`                                                                                                              | `notification-service` · `notification-store`                              | `[ws]/inbox/*`                                                  |                     ✅                      |
| **Analytics**            | `AnalyticsController` · `AnalyticsService` · (reads Issue/Cycle)                                                                                                               | `analytics-service` · —                                                    | `[ws]/analytics`                                                |                     ✅                      |
| **AI Assistant**         | `AssistantController` · `AssistantService`,`GroqService` · (context aggregation)                                                                                               | (assistant FAB / command palette)                                          | `[ws]/agents`, `assistant-fab`                                  |           ⚠️ simulated streaming            |
| **AI Insights**          | `AnalyticsController /insights` · `AnalyticsService`,`GroqService` · `ai_runs`,`insight_snapshots`                                                                             | `analytics-service.getAiInsights`                                          | `[ws]/analytics`                                                |                ⚠️ no caching                |
| **Smart Assign**         | `IssueController /smart-assign` · `SmartAssignService`,`GroqService` · `member_skill_profiles`,`assignment_events`                                                             | `issue-service.smartAssignIssue` · `smart-assign-panel`                    | issue detail                                                    |             ✅ (Groq fallback)              |
| **Attachments (GED)**    | `AttachmentController`,`FileController` · `AttachmentService`,`MinioService` · `Attachment`                                                                                    | `attachment-service` · —                                                   | issue detail                                                    |            ❌ FE route undefined            |
| **Integrations**         | `IntegrationController`,`WebhookController` · `GitHubIntegrationService`,`SlackIntegrationService`,`WebhookService` · `Integration`,`IssueGitHubLink`,`SlackChannel`,`Webhook` | `integration-service` · `integration-store`                                | `[ws]/settings`                                                 |            ❌ FE route undefined            |
| **Sales (leads)**        | `SalesController` · `SalesService` · `EnterpriseInquiry`                                                                                                                       | (enterprise contact dialog)                                                | landing / pricing                                               |               ⚠️ notify stub                |

Health column reconciled with [`api-contracts.md`](./api-contracts.md) and [`known-issues.md`](./known-issues.md).

---

## 2. Backend dependency rules

```
        ┌─────────────┐
        │  modules/   │   chat · ged · sales   (feature-bounded)
        └──────┬──────┘
               │ may use
        ┌──────▼──────┐
        │   core/     │   domain services, entities, repos
        └──────┬──────┘
               │ may use
        ┌──────▼──────┐
        │  shared/    │   config · security · audit · dto · exception
        └─────────────┘
```

**Rule:** dependencies point downward only. `shared` knows nothing of `core`/`modules`; `core` knows
nothing of `modules`. Enforced by convention (see `backend/tf-api/ARCHITECTURE.md`).

**Cross-domain coupling inside `core`:**

- `AnalyticsService`, `AssistantService`, `SmartAssignService` read `Issue`/`Cycle`/member data → depend on issue/project/workspace repos.
- `AuthService` orchestrates `KeycloakService` (identity) + `StripeService` (billing) + `OtpService`/`EmailService`.
- All workspace-scoped services depend on `WorkspaceService`/`WorkspaceMemberRepository` for authorization.
- `GroqService` is shared by Assistant, SmartAssign, and Analytics-insights (single Groq client).

**Module → external infra:**

- `chat` → RabbitMQ/STOMP (`WebSocketConfig`, `StompAuthInterceptor`).
- `ged` → MinIO (`MinioConfig`, `MinioService`).
- `sales` → standalone (only DB + intended email notify).

---

## 3. Frontend store ↔ service ↔ domain

Zustand stores in `frontend/lib/store/`. Each store calls one (sometimes two) services.

| Store                | Service(s)             | Domain                                                               |
| -------------------- | ---------------------- | -------------------------------------------------------------------- |
| `user-store`         | `user-service`         | current user profile                                                 |
| `workspace-store`    | `workspace-service`    | workspaces, members, active workspace                                |
| `project-store`      | `project-service`      | projects, active project                                             |
| `issue-store`        | `issue-service`        | issues, statuses, types, comments, activity, relations, smart-assign |
| `cycle-store`        | `cycle-service`        | cycles + cycle issues                                                |
| `label-store`        | `label-service`        | labels by project                                                    |
| `page-store`         | `page-service`         | wiki pages by project                                                |
| `team-store`         | `team-service`         | teams _(incomplete impl — KI-006)_                                   |
| `discussion-store`   | `discussion-service`   | forum discussions                                                    |
| `message-store`      | `message-service`      | chat channels & messages                                             |
| `notification-store` | `notification-service` | inbox signals + unread count                                         |
| `profile-store`      | `profile-service`      | profile stats, activity, heatmap                                     |
| `integration-store`  | `integration-service`  | GitHub/Slack/webhooks                                                |
| `preferences-store`  | (local)                | UI preferences (theme, etc.)                                         |

**Cross-store coupling:** most stores key data by `workspace slug` / `projectId` taken from the active
workspace/project; switching workspace should reset dependent stores. `auth-context` gates all of them.

---

## 4. Data layer — Flyway migration timeline (`db/migration/`)

| Range        | Theme                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1–V12       | Bootstrap: users/companies, auth + subscriptions + OTP, plan-type cleanup (`PREMIUM`→`PRO`), enterprise contact fields, user profile columns                |
| V13–V16      | Multi-tenant core: workspaces (+UUID), projects/members/labels, issues (+statuses/types/comments/activity/relations)                                        |
| V17–V18, V31 | Dev/QA seed data (users, workspaces, extended QA users)                                                                                                     |
| V19–V22      | Issue UX: project icons, drag-order `position`, enhanced relations                                                                                          |
| V23–V30      | Feature tables: cycles, notifications, pages, teams, discussions, chat (channels/messages/members), attachments, integrations (github links/slack channels) |
| V32–V35      | AI: `ai_documents` (pgvector), `member_skill_profiles`, `assignment_events`, `ai_runs` + `insight_snapshots`                                                |

DB init scripts (`db/init/`): `01-init-keycloak-db.sql`, `02-init-pgvector.sql`.
Entities in `core/model/` and `modules/*/domain/` must stay in sync (`ddl-auto=validate` fails otherwise).

---

## 5. Entity relationship summary

```
User 1─N Workspace(owner) ;  Workspace 1─N WorkspaceMember ─ User
Workspace 1─N { Project, Team, Cycle*, Discussion, Channel }
Project   1─N { ProjectMember, ProjectLabel, Issue, Cycle, Page, Channel }
Issue     1─N { IssueComment, IssueActivity, IssueRelation, IssueGitHubLink, Attachment }
Issue     N─M ProjectLabel ;  Issue N─M Cycle (via CycleIssue)
Team      1─N TeamMember ─ User
Channel   1─N ChatMessage ;  Channel N─M ChannelMember ─ User
Integration 1─N { IssueGitHubLink | SlackChannel }
User 1─1 OtpVerification ; User 1─N { Subscription, RefreshToken, Notification }
```

\* `Cycle` is workspace- and project-scoped depending on creation context.

Enums (19) live in `core/enums/`: plan/subscription (`PlanType`,`PlanStatus`), OTP
(`OtpType`,`OtpStatus`), roles (`WorkspaceRole`,`ProjectRole`,`TeamRole`), issue
(`IssuePriority`,`IssueStatusCategory`,`IssueActivityType`,`IssueRelationType`),
project/cycle/discussion lifecycle, chat (`ChannelKind`), integrations
(`IntegrationProvider`,`GitHubLinkType`,`GitHubLinkStatus`).
