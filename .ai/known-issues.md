# Known Issues — Triage Board

> **Brain-OS document** · Generated 2026-06-05 · Read-only knowledge artifact for AI agents.
> Prioritized, scored view of the problems catalogued in [`technical-debt.md`](./technical-debt.md).
> Each issue: **Priority · Impact · Effort · Confidence**, with the fix locus (not applied here).
> Effort scale: S ≤2h · M ½–1d · L 1–3d · XL >3d. Confidence = how sure the finding is true.

## ✅ Recently fixed — 2026-06-15 (branche `feat/dashboard`, QA gestion de projet)

| Sujet | Cause racine | Correctif | Fichier |
| ----- | ------------ | --------- | ------- |
| Build error `stream did not contain valid UTF-8` sur la page projet | Fichier encodé **Windows-1252** (`…`, `·`) au lieu d'UTF-8 | Reconverti en UTF-8 ; scan complet du front : aucun autre fichier touché | `projects/[id]/pages/[pageId]/page.tsx` |
| Boucle compile/render infinie en dev (Docker/Windows) | Polling re-détecte les écritures de Next dans `.next/` | `watchOptions.ignored` (`.next`/`node_modules`/`.git`) + `poll:1000` | `frontend/next.config.ts` |
| Timeout au login / la page ne render pas seule | `login()` bloquait sur `fetchMe()` séquentiel sous timeout axios 10 s + redirection indirecte | Timeout → 30 s ; `fetchMe()` non bloquant ; `router.replace("/")` explicite | `lib/api/client.ts`, `lib/contexts/auth-context.tsx`, `components/auth/login/login-form.tsx` |
| **500** à la création de Cycle | `Cycle.status` manquait `@JdbcTypeCode(NAMED_ENUM)` alors que la colonne est l'enum natif PG `cycle_status` (seul des 7 enums du modèle à l'oublier) | Annotation ajoutée (rebuild image backend requis) | `core/model/Cycle.java` |
| **500** au changement de Label d'une issue | `issue.setLabels(newLabels)` remplaçait le PersistentBag → DELETE+INSERT violant la PK de `issue_label_assignments` | `clear()/addAll()` (mutation de collection) | `core/service/IssueService.java` |
| Gestion de projet (board) : création inline en double, pas de drag&drop, couleurs de colonnes non éditables, Settings en double, onglet Issues redondant | UI incomplète | Bouton de création unique (suppression des quick-add board+list) ; drag&drop des cards via `@dnd-kit/core` ; color-picker (presets+hex) à la création **et** l'édition de colonne ; Settings retiré du menu ⋯ (reste en onglet) ; onglet **Issues** retiré (doublon de List, façon GitHub) | `projects/[id]/page.tsx`, `.../list/page.tsx`, `.../layout.tsx`, `components/ui/color-picker.tsx` |

> ⚠️ **Gotcha dev** : le backend tourne depuis un **JAR pré-buildé** (`java -jar app.jar`) ; le volume `src` ne sert qu'à Flyway. Toute modif de code Java exige `docker compose -f docker-compose.dev.yml up -d --build backend`.

### Phase frontend — fait 2026-06-15 (suite)
- **Filtres** du board : popover priorité/assigné/label (options dérivées des issues), badge de compteur + reset. `components/issues/issue-filters.tsx` + `lib/issue-filters.ts`, câblé dans `projects/[id]/page.tsx`. (List/Backlog n'ont pas de bouton Filtres → non câblés.)
- **Cycle date picker** : inputs `type="date"` natifs remplacés par un `DatePicker` shadcn (Calendar/Popover, ISO `yyyy-MM-dd`). `components/ui/date-picker.tsx` + `cycles/page.tsx`.

### Phase BACKEND — fait 2026-06-15 (full-stack)
- **Favoris projet** : migration `V37__project_favorites.sql` (table user-scoped) + entité `ProjectFavorite` + repo + endpoints `POST/DELETE /api/workspaces/{slug}/projects/{id}/favorite` + `isFavorite` dans `ProjectResponse` (`@JsonProperty`). Front : `toggleFavorite` (store optimiste) + bouton Star câblé dans le layout projet.
- **Story points** : migration `V38__issue_story_points.sql` (colonne `story_points`) + `Issue.storyPoints` + `UpdateIssueRequest`/`IssueResponse` (convention : null = pas de changement, 0 = retirer). Front : input remplacé par un **select de presets** (1,2,3,5,8,13) dans l'issue-sheet, qui **persiste** désormais (avant : state local uniquement).
- **My Work** : nouvel endpoint cross-projets `GET /api/workspaces/{slug}/my-issues` (`MyWorkController` + `IssueService.listMyIssues` + query repo) — supprime le **N+1** côté front. `IssueResponse` enrichi de `projectId`/`projectName`. `my-work-view` refactoré (1 appel au lieu de N×3).
- **Inbox** : ack unitaire — endpoint `PATCH /api/workspaces/{slug}/notifications/{id}/acknowledge` + `NotificationService.acknowledge` ; front : `acknowledgeLocal` (client-only, perdu au refetch) remplacé par un vrai `acknowledge` (API + optimiste).

### Phase finale — fait 2026-06-15 (reste de la QA)
- **Pièces jointes (MinIO)** : le code était complet des 2 côtés ; seule la **config** manquait. Ajout des vars `MINIO_*` au service `backend` dans `docker-compose.dev.yml` (joint par nom `http://minio:9000`) + `depends_on: minio` + limite `spring.servlet.multipart` (25 MB) dans `application-dev.yml`. Upload/liste/download/delete fonctionnels.
- **Mentions** : `IssueService.addComment` parse désormais les `@…` (format : `@email` ou `@partie-locale-email`, ex. `@pierre.michel`), les résout contre les **membres du workspace** et appelle `notifyMentions` → l'onglet Mentions se remplit.
- **Alerts dueSoon/overdue** : `@EnableScheduling` activé + `DueDateAlertScheduler` (cron quotidien `0 0 8 * * *`, surchargeable via `taskforce.alerts.due-date-cron`) → `NotificationService.notifyDueDate` avec **dédup** (`existsByRecipientIdAndIssueIdentifierAndTypeAndAcknowledgedFalse`). Fenêtre dueSoon = 2 jours.
- **« link open »** : le bouton « Open » de l'issue-sheet (placeholder `toast.info`) navigue maintenant vers `issues/[issueId]` (page pleine).
- **Reflet couleur de statut** : le badge + le dropdown de statut de l'issue-sheet utilisent désormais la vraie `status.color` (via `displayStatuses` + `statusId`) au lieu d'une couleur figée par catégorie → reflète les couleurs de colonnes personnalisées.
- **My Work édition inline** : non ajouté — décision = éditer dans la gestion de projet (les lignes My Work cliquent déjà vers l'issue via `<Link>`).

> Toutes les tâches de la QA gestion de projet sont traitées. Restent hors-scope explicitement reportés : **intégration GitHub** (l'utilisateur a dit « pour l'instant j'ai pas encore »).

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
