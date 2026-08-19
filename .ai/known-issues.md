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

## ✅ Fait 2026-06-16 (QA gestion de projet — lot 2) + audit

- **500 `/analytics/insights`** → corrigé : `try/catch` élargi à tout le corps de `AnalyticsService.generateInsights` + `@Transactional(readOnly=true)` (relance le 404 légitime, sinon fallback gracieux — plus jamais de 500). Cache V35 (`ai_insight_snapshots`) toujours non branché (latence persiste, non bloquant).
- **`ERR_EMPTY_RESPONSE` sur /users/me + /workspaces** au chargement dashboard = **transitoire** (backend en redémarrage lors d'un rebuild), pas un bug.
- **Invitation workspace avec rôle + recherche** → `InviteMemberRequest.role` (backend honore le rôle, OWNER refusé) + dialog `members/page.tsx` refait : recherche d'utilisateur (`searchUsers`, débouncée) + `Select` de rôle (Member/Admin).
- **Teams/Squads dé-ambiguïsé** : nav « Squads »→« Teams », « Team »→« Members » (EN/FR + `app-topbar`). Techniquement teams=squads (un seul concept, V26).
- **Refonte style Cloudflare flat** (lot précédent) + page **Operations** reconstruite en shadcn pur (Card/Tabs/Table/Badge/Progress) — gabarit de référence pour migrer les autres pages hors du CSS custom (`@layer components`).

### Audit PM — restant à faire (priorisé, décision/ampleur)
1. **Chargement dynamique des onglets** (Signals, My Queue, onglets projet Board/List/Backlog…) : aujourd'hui chaque onglet = **route séparée** → remount + refetch complet (effet « nouvelle page »). Fix = page unique + `Tabs` shadcn client-side + stores cache-first. Refactor moyen, multi-pages.
2. **Inviter un email SANS compte** (vrai GitHub-like) : nécessite système d'invitation (table `workspace_invitations` token+email + EmailService existant) OU user « pending ». Décision auth requise.
3. **Auto-assignation** : fonctionne (règles + Groq fallback, `SmartAssignService`), mais l'endpoint **recommande** seulement. Pour tester : projet avec ≥2 membres actifs + issues ; optionnel `member_skill_profiles` (aucune UI pour saisir les compétences). pgvector V33 défini mais mort. → seed de test possible.
4. **Champs custom typés** sur issues (comme demandé) = **feature à construire** (n'existe pas) : modèle `custom_field` + valeurs + UI de création de type de champ.
5. **Migrer le reste des pages** (Dashboard, Signals, My Queue, Intelligence, Agents, détail projet) vers shadcn pur et **supprimer le bloc `@layer components`** custom de `globals.css`.
6. **Membres de projet** : `addMember` exige déjà membre du workspace (ok), mais UI sans recherche + rôle hardcodé MEMBER + changement de rôle = stub.

## ✅ Fait 2026-07-20 (branche `chore/v1-closure`) — aperçu des PJ, Signal Center, rate limiting

Trois symptômes sans rapport apparent, trois causes racines distinctes. Chacune a été **mesurée avant
correctif** — dans les trois cas l'hypothèse de départ était fausse.

### 1. Aperçu des pièces jointes cassé — cause : la **CSP**, pas MinIO

- **Symptôme** : vignette d'image cassée dans le sheet d'issue ; le `fetch` de l'URL présignée échoue en
  `TypeError: Failed to fetch`.
- **Pistes écartées par la mesure** : le backend renvoyait **200** sur `/attachments`, MinIO était joignable,
  la signature présignée était **valide** (URL générée avec `mc` → HTTP 200, 1449 octets) et le CORS MinIO
  renvoyait bien `Access-Control-Allow-Origin: http://localhost:3000`. Ni le réseau, ni la signature, ni le
  CORS n'étaient en cause.
- **Cause réelle** : `frontend/next.config.ts` construisait la CSP **sans l'origine du stockage objet**.
  `img-src 'self' data: blob: https: ${API_ORIGIN}` — le mot-clé `https:` **ne couvre pas** un MinIO local
  en `http://localhost:9000`, et `connect-src` ne le listait pas non plus. Le navigateur bloquait donc la
  requête **avant** tout échange réseau, d'où un échec qui ressemble à une panne de stockage.
- **Correctif** : nouvelle constante `STORAGE_ORIGIN` alimentée par `NEXT_PUBLIC_STORAGE_URL` (défaut
  `http://localhost:9000`), ajoutée à **`img-src` ET `connect-src`** ; variable passée au service `frontend`
  dans `docker-compose.dev.yml`.
- ⚠️ **Invariant à tenir** : `NEXT_PUBLIC_STORAGE_URL` (front) doit rester **aligné sur
  `MINIO_PUBLIC_ENDPOINT`** (back) — c'est l'hôte qui signe l'URL.
- **Vérifié en live** : la vignette du logo s'affiche sur l'issue 4826.

### 2. Lignes mortes dans le Signal Center — cause : liens de notification **NULL**

- **Cause structurelle** : la table `notifications` ne porte **aucune clé étrangère** vers `issues`/`projects` ;
  `issue_url`/`project_url` sont **dénormalisées à l'écriture** par `NotificationService.buildNotification`.
  Une ligne insérée **hors du code Java** (en pratique : le seed) arrive donc avec des liens `NULL`, et rien
  ne permet de les reconstruire à la lecture.
- **Constat mesuré** : **35 lignes sur 266** sans lien — exactement les lignes du seed. Elles affichaient bien
  un identifiant (« WEB-3 ») mais le clic ne faisait rien.
- **Correctifs** :
  1. Migration Flyway **`V71__backfill_notification_urls.sql`** : reconstruit les liens en décomposant
     `issue_identifier` (« WEB-3 » → identifiant projet + numéro de séquence) puis en rejoignant
     `projects`/`issues`, avec un filet qui ramène **au moins vers le projet**. Idempotente (ne touche que
     les colonnes `NULL`).
  2. `backend/tf-api/seed/dev_seed.sql` : bloc de **résolution des liens en fin de seed** (même règle) ;
     identifiants du bloc de volume tirés d'issues **réelles** au lieu d'être fabriqués (`'WEB-' || n`) ;
     signal de surcharge aligné sur la convention Java `overload-<userId>`.
  3. Garde front : `DataTable` accepte `isRowClickable` — une ligne **sans destination** n'est ni cliquable
     ni pourvue du bouton « ouvrir ».
- **Résultat mesuré après migration** : **265/266** lignes résolues. Reste **1 ligne** (`overload` du seed
  historique, `issue_identifier` `NULL`) — irrécupérable par jointure, corrigée au prochain reseed.

### 3. Blocages de rate limiting

- **Cause n°1 — les préflights comptaient** : `RateLimitFilter` (bucket4j, par IP, `OncePerRequestFilter`
  monté sur `/api/*` **avant** Spring Security) comptait **aussi** les préflights CORS `OPTIONS`. Le front
  étant sur une origine différente (`localhost:3000` → `localhost:8080`), chaque requête non simple en
  générait un : **le quota réel était divisé par deux**.
- **Cause n°2 — la vue « Ma file » était bavarde** : `3 + 2N` requêtes par affichage (un appel cycles **et**
  un appel pages **par projet**, N = nombre de projets).
- **Cause n°3 — l'attente était invisible** : le profil `DEFAULT` est de **200 requêtes / 60 s** et
  `refillIntervally` rend **tous les jetons d'un coup** en fin de fenêtre → l'attente réelle va de **0 à 60 s**
  (et non ~10 s). Aucun en-tête `Retry-After` n'était émis et le front n'avait **aucun traitement du 429** :
  les stores avalaient l'erreur, l'application paraissait figée.
- **Correctifs** : `shouldNotFilter` exclut `OPTIONS` ; le filtre émet `Retry-After` et
  `X-RateLimit-Remaining`, **exposés via `CorsConfig.setExposedHeaders`** (sans quoi ils restent masqués au JS
  en cross-origin) ; nouveaux endpoints agrégés `GET /api/workspaces/{slug}/my-cycles` et
  `GET /api/workspaces/{slug}/my-pages` ; `client.ts` affiche un toast dédié au **429** avec le délai réel.
- **Mesures live** : 20 préflights `OPTIONS` consomment **0 jeton** (199 → 198, seul le GET réel compte) ;
  un 429 renvoie `Retry-After: 57` ; « Ma file » passe de `3+2N` à **3 appels agrégés**, **0 appel par projet**
  mesuré.

## ✅ Fait 2026-07-20 (branche `chore/v1-closure`) — contrôle d'accès des pièces jointes (IDOR)

Vérifier le **scope** d'une ressource n'est pas l'**autoriser** : la première question dit où vit l'objet,
la seconde dit **qui** a le droit de le demander. Les pièces jointes ne posaient que la première.

### Contrôle d'accès manquant sur les pièces jointes d'issue

- **Le défaut** : `AttachmentService` ne faisait qu'une vérification de **scope** (`findScopedIssue` —
  « l'issue appartient-elle bien au projet et au workspace de l'URL ? »). Cela ne dit **rien de qui**
  demande. `AttachmentController.list` injectait `@AuthenticationPrincipal Jwt jwt` mais **ne le lisait
  jamais**, et `listByIssue` ne recevait **aucun `userId`**. Un grep de
  `WorkspaceMember|ProjectMember|hasAccess|assertMember` sur tout l'arbre `modules/ged` ne renvoyait
  **aucun résultat**. Contrevient à la règle du projet : « Autorisation au niveau service : vérifier
  `WorkspaceMember`/`ProjectMember` + rôles ».
- **Portée réelle — plus étroite que soupçonné au départ** : un compte **totalement étranger au
  workspace** était **déjà** bloqué en amont par `WorkspaceAccessInterceptor` (mesuré : **403** « Accès
  refusé : vous n'êtes pas membre de cet espace de travail », en lecture **comme** en upload, avec le
  compte `test@taskforce.dev`). La faille exploitable était donc : **un membre du workspace pouvait lire
  et téléverser les pièces jointes d'un projet PRIVÉ dont il n'est pas membre**. Aggravant : l'**URL
  présignée MinIO** renvoyée n'exige ensuite **plus aucune authentification pendant une heure** — la
  fuite **survit à la requête**.
- **Correctif** : deux helpers explicites au-dessus de `findScopedIssue`, sur le modèle déjà en place
  dans `PageService` —
  1. lecture (`listByIssue`) → `ProjectVisibilityGuard.assertCanView` : projet invisible = **404, jamais
     403** (on ne révèle pas son existence) ;
  2. écriture (`upload`) → `assertCanWrite` : 404 si invisible, refus si rôle `VIEWER` (lecture seule) ;
  3. `delete` → la garde est placée **AVANT** le contrôle de propriété existant. Motif : un non-membre
     recevait auparavant un 403 « vous n'êtes pas le propriétaire », ce qui **confirmait l'existence** de
     la pièce jointe.
  4. `listByIssue` prend désormais un `userId`, transmis par le contrôleur (signature passée de **3 à 4
     arguments**).
- **Vérification** : suite backend complète verte — **759 tests, 0 échec, 0 erreur** (contre **755** avant,
  soit **+4 cas**). Nouveau bloc `@Nested` « Contrôle d'accès (IDOR) » dans
  `AttachmentServiceIntegrationTest` : non-membre en lecture → 404, non-membre en upload → 404, membre du
  projet → lecture OK, `VIEWER` → lecture OK mais upload refusé (`BusinessException`).
- **Preuve end-to-end en dev**, compte `admin@taskforce.dev` (MEMBER du workspace `pierre`, **non-membre**
  du projet privé 84) :
  - `GET /api/workspaces/pierre/projects/84/issues/4828/attachments` → **404 « Projet introuvable »** ;
  - `GET /api/workspaces/taskforce-demo/projects/78/issues/4826/attachments` → **200**, 1 pièce jointe —
    le chemin légitime est **intact**.
- ⚠️ **Dette relevée au passage** : le seed du test d'intégration existant créait un workspace **sans ligne
  `WorkspaceMember` pour son propriétaire**, ce qui rendait même l'owner **non-admin** aux yeux de
  `ProjectVisibilityGuard`. Corrigé en reprenant le helper documenté de `PageServiceIntegrationTest`.

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
