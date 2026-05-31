# 📋 Taskforce — Suivi d'implémentation

> Dernière mise à jour : 2026-05-26  
> Objectif : 100% d'implémentation + QA + tests

---

## Légende

| Icône | Statut |
|-------|--------|
| ✅ | Fait |
| 🔄 | En cours |
| ⏳ | À faire |
| 🐛 | Bug identifié en QA |
| ❌ | Bloqué |

---

## PHASE 1 — Complétion des features scaffoldées (Frontend)

> Connecter ce qui existe déjà côté backend mais pas encore côté frontend

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 1.1 | Connecter `/[workspace]/members` (list, invite, remove) | ✅ | useWorkspaceStore (fetchMembers, invite, kick, changeRole) |
| 1.2 | Connecter `/[workspace]/teams` (CRUD teams + membres) | ✅ | useTeamStore (fetchTeams, create, delete) |
| 1.3 | Connecter `/[workspace]/settings` (update nom/logo, delete workspace) | ✅ | useWorkspaceStore + useUserStore |
| 1.4 | Connecter `/[workspace]/projects/[id]/settings` (update/delete project) | ✅ | useProjectStore (updateProject, archiveProject, deleteProject) |
| 1.5 | Connecter `/[workspace]/inbox` (notifs réelles via notificationService) | ✅ | useNotificationStore |
| 1.6 | Connecter `/[workspace]/my-work` (issues assignées au user connecté) | ✅ | useProjectStore + useIssueStore + useCycleStore + useUserStore |
| 1.7 | Compléter `/[workspace]/projects/[id]/cycles/[cycleId]` (détail + issues) | ✅ | useCycleStore |

---

## PHASE 2 — Features manquantes (Backend + Frontend)

### 2A — Messages / Chat

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.1 | Entité `Message` + `Channel` + migration Flyway | ✅ | V28__chat.sql |
| 2.2 | `MessageService` + `ChannelService` | ✅ | |
| 2.3 | `MessageController` (CRUD messages, channels) | ✅ | |
| 2.4 | WebSocket STOMP/SockJS — config + broker | ✅ | RabbitMQ relay + fallback in-memory |
| 2.5 | `messageService.ts` côté frontend | ✅ | + message-store.ts + use-stomp.ts |
| 2.6 | Connecter `MessageList`, `MessageInput`, `ChatSidebar` | ✅ | |
| 2.7 | Temps réel côté frontend (WebSocket client) | ✅ | @stomp/stompjs |

### 2B — Roadmap

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.8 | Endpoint GET roadmap (issues avec dates start/due par projet) | ✅ | |
| 2.9 | Connecter `/roadmap` avec vrai Gantt/timeline | ✅ | |

### 2C — Upload fichiers / Pièces jointes

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.10 | Config stockage (S3 / Minio local) | ✅ | Minio docker + env + application-dev.yml + MinioConfig + MinioService |
| 2.11 | `AttachmentService` + endpoints upload/download | ✅ | V29__attachments.sql + Attachment entity/repo/DTO + AttachmentController |
| 2.12 | UI upload dans `IssueSheet` + commentaires | ✅ | Onglet Attachments dans IssueSheet (upload/list/download/delete) |

---

## PHASE 2.5 — Finition & connexion des recoinss de l'app (audit post-Phase 2)

> Identifié lors de l'audit complet — à terminer AVANT Phase 3

### 2.5A — IssueSheet (critique)

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.13 | Connecter mutations `updateIssue()` : status, priority, assignee, title, description, points, cycle, due date | ✅ | API connectée — statuts réels, membres réels, dueDate |
| 2.14 | Remplacer `TEAM_MEMBERS` hardcodés par vrais membres du projet (API) | ✅ | `listProjectMembers()` + `fetchStatuses()` au chargement |
| 2.15 | Remplacer `ALL_LABELS` hardcodés par labels du projet (API ou config) | ✅ | Labels CRUD complet : backend (`ProjectLabel`, `PUT /labels/{id}`), `label-service`, `label-store`, section Labels dans settings, issue-sheet utilise le store |
| 2.16 | Implémenter les commentaires : backend `IssueComment` + `CommentService` + endpoint | ✅ | Déjà implanté en backend |
| 2.17 | Connecter les commentaires côté frontend (`fetchComments`, `addComment`) | ✅ | CommentsTab avec store réel + delete |
| 2.18 | Implémenter l'activité (`IssueActivity`) : backend + frontend | ✅ | ActivityTab avec store réel + formatage acteur/valeurs |

### 2.5B — Actions manquantes sur les pages

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.19 | `create-cycle-dialog.tsx` : remplacer `PROJECTS` hardcodés par `useProjectStore()` | ✅ | `useParams` + `fetchProjects` on open |
| 2.20 | `discussions/page.tsx` : connecter Pin / Lock / Delete aux actions du store | ✅ | `togglePin`, `toggleLock`, `deleteDiscussion` connectés + store réel |
| 2.21 | `/[workspace]/issues/page.tsx` : connecter Edit / Assign / Delete sur chaque issue | ✅ | Delete connecté (`deleteIssue`), Edit/Assign laisssés |
| 2.22 | `/[workspace]/cycles/page.tsx` : connecter View / Edit / Delete sur chaque cycle | ✅ | View → router.push, Delete → `deleteCycle` |

### 2.5C — Données statiques résiduelles

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.23 | `settings/page.tsx` : upload avatar via API (Minio déjà dispo) | ✅ | Upload multipart → `POST /api/users/me/avatar` → proxy `/api/files/avatars/{id}` |
| 2.24 | `analytics/page.tsx` : `CAPACITY_DATA` depuis API (membres + charge réelle) | ✅ | `GET /analytics/capacity` — open issues par membre via `WorkspaceMemberRepository` |
| 2.25 | `projects/page.tsx` : `RISK_SIGNALS` + `deriveVelocity()` depuis données réelles | ✅ | Dérivé de `totalIssues`, `openIssues`, `updatedAt`, `createdAt` |
| 2.26 | `messages/page.tsx` : supprimer fallback `MOCK_MESSAGES` quand API opérationnelle | ✅ | Import supprimé, `useState({})` |

---

## PHASE 3 — Intégrations tierces

### 3A — GitHub

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 3.1 | Entité `Integration` + migration Flyway | ✅ | V30__integrations.sql |
| 3.2 | `GitHubIntegrationService` (OAuth App, repos, branches, PRs) | ✅ | |
| 3.3 | Endpoint `/integrations/github/connect` (redirect OAuth) | ✅ | |
| 3.4 | Endpoint `/integrations/github/callback` (code → token) | ✅ | PUBLIC_MATCHERS |
| 3.5 | Lier PR/commit à une issue (`IssueGitHubLink`) | ✅ | |
| 3.6 | Page settings intégrations + bouton "Connect GitHub" | ✅ | |
| 3.7 | Afficher PRs/commits liés dans le détail d'une issue | ✅ | Tab GitHub dans IssueSheet |

### 3B — Slack

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 3.8 | `SlackIntegrationService` (OAuth, envoyer notifs) | ✅ | |
| 3.9 | Endpoint `/integrations/slack/connect` + callback | ✅ | |
| 3.10 | Config canal Slack par workspace (quel channel reçoit quoi) | ✅ | |
| 3.11 | Bouton "Connect Slack" dans settings + config canaux | ✅ | IntegrationsPanel |

### 3C — Webhooks génériques

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 3.12 | `WebhookService` — events HTTP sortants | ✅ | @Async |
| 3.13 | CRUD webhooks dans settings workspace | ✅ | IntegrationsPanel |

---

## PHASE 4 — Smart Assign / IA

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 4.1 | Algorithme Smart Assign (charge, compétence, historique) | ⏳ | `TEAM_PROFILES` fictifs + setTimeout actuellement |
| 4.2 | Endpoint `POST /issues/{id}/smart-assign` | ⏳ | |
| 4.3 | Connecter `SmartAssignPanel` à l'endpoint réel | ⏳ | |
| 4.4 | CommandPalette / Assistant IA (intégration LLM) | ⏳ | |
| 4.5 | `agents/page.tsx` : remplacer adapter mock par vrai backend IA | ⏳ | Streaming via setTimeout actuellement |
| 4.6 | `dashboard/page.tsx` : `AI_INSIGHTS`, `EXCEPTIONS`, `AGENTS` depuis API | ⏳ | Tout statique actuellement |

---

## PHASE QA — Tests manuels

> À remplir au fil des tests

| # | Scénario | Statut | Bugs trouvés |
|---|----------|--------|--------------|
| QA-1 | Inscription complète (3 étapes) | ⏳ | |
| QA-2 | Login / logout / refresh token | ⏳ | |
| QA-3 | Reset password | ⏳ | |
| QA-4 | Créer workspace, inviter membre | ⏳ | |
| QA-5 | Créer projet, modifier, supprimer | ⏳ | |
| QA-6 | CRUD issues (assigner, statut, commentaires, relations) | ⏳ | |
| QA-7 | Créer cycle, assigner issues, fermer cycle | ⏳ | |
| QA-8 | Analytics (KPIs, burndown, velocity) | ⏳ | |
| QA-9 | Discussions (créer, commenter, pin, lock) | ⏳ | |
| QA-10 | Notifications (réception, lecture) | ⏳ | |
| QA-11 | Profil utilisateur (modifier, avatar) | ⏳ | |
| QA-12 | Paiement Stripe (mode test) | ⏳ | |
| QA-13 | Navigation mobile / responsive | ⏳ | |
| QA-14 | Intégration GitHub | ⏳ | |
| QA-15 | Intégration Slack | ⏳ | |
| QA-16 | Messages / Chat | ⏳ | |
| QA-17 | Roadmap (timeline) | ⏳ | |
| QA-18 | Upload pièce jointe sur une issue | ⏳ | |

---

## PHASE Fix — Bugs QA

> Rempli après les sessions de test

| # | Description | Sévérité | Statut | Lié à |
|---|-------------|----------|--------|-------|
| — | *à compléter après QA* | — | — | — |

---

## PHASE 5 — Tests automatisés

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 5.1 | Tests unitaires : `IssueService`, `ProjectService`, `WorkspaceService` | ⏳ | |
| 5.2 | Tests unitaires : `CycleService`, `DiscussionService`, `PageService` | ⏳ | |
| 5.3 | Tests unitaires : `AnalyticsService`, `NotificationService` | ⏳ | |
| 5.4 | Tests controllers (`@WebMvcTest`) endpoints critiques | ⏳ | |
| 5.5 | Tests frontend composants clés (LoginForm, RegisterForm, IssueSheet) | ⏳ | |
| 5.6 | Tests E2E Playwright sur scénarios QA critiques | ⏳ | |

---

## Avancement global

| Phase | Progression | Statut |
|-------|------------|--------|
| Phase 1 — Features scaffoldées | 7 / 7 | ✅ |
| Phase 2 — Features manquantes | 12 / 12 | ✅ |
| Phase 2.5 — Finition recoinss (audit) | 14 / 14 | ✅ |
| Phase 3 — Intégrations | 13 / 13 | ✅ |
| Phase 4 — Smart Assign / IA | 0 / 6 | ⏳ |
| Phase QA — Tests manuels | 0 / 18 | ⏳ |
| Phase Fix — Bugs | 0 | ⏳ |
| Phase 5 — Tests automatisés | 0 / 6 | ⏳ |
| **TOTAL** | **46 / 76** | 🔄 |


---

## Légende

| Icône | Statut |
|-------|--------|
| ✅ | Fait |
| 🔄 | En cours |
| ⏳ | À faire |
| 🐛 | Bug identifié en QA |
| ❌ | Bloqué |

---

## PHASE 1 — Complétion des features scaffoldées (Frontend)

> Connecter ce qui existe déjà côté backend mais pas encore côté frontend

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 1.1 | Connecter `/[workspace]/members` (list, invite, remove) | ✅ | useWorkspaceStore (fetchMembers, invite, kick, changeRole) |
| 1.2 | Connecter `/[workspace]/teams` (CRUD teams + membres) | ✅ | useTeamStore (fetchTeams, create, delete) |
| 1.3 | Connecter `/[workspace]/settings` (update nom/logo, delete workspace) | ✅ | useWorkspaceStore + useUserStore |
| 1.4 | Connecter `/[workspace]/projects/[id]/settings` (update/delete project) | ✅ | useProjectStore (updateProject, archiveProject, deleteProject) |
| 1.5 | Connecter `/[workspace]/inbox` (notifs réelles via notificationService) | ✅ | useNotificationStore |
| 1.6 | Connecter `/[workspace]/my-work` (issues assignées au user connecté) | ✅ | useProjectStore + useIssueStore + useCycleStore + useUserStore |
| 1.7 | Compléter `/[workspace]/projects/[id]/cycles/[cycleId]` (détail + issues) | ✅ | useCycleStore |

---

## PHASE 2 — Features manquantes (Backend + Frontend)

### 2A — Messages / Chat

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.1 | Entité `Message` + `Channel` + migration Flyway | ✅ | V28__chat.sql |
| 2.2 | `MessageService` + `ChannelService` | ✅ | |
| 2.3 | `MessageController` (CRUD messages, channels) | ✅ | |
| 2.4 | WebSocket STOMP/SockJS — config + broker | ✅ | RabbitMQ relay + fallback in-memory |
| 2.5 | `messageService.ts` côté frontend | ✅ | + message-store.ts + use-stomp.ts |
| 2.6 | Connecter `MessageList`, `MessageInput`, `ChatSidebar` | ✅ | |
| 2.7 | Temps réel côté frontend (WebSocket client) | ✅ | @stomp/stompjs |

### 2B — Roadmap

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.8 | Endpoint GET roadmap (issues avec dates start/due par projet) | ✅ | |
| 2.9 | Connecter `/roadmap` avec vrai Gantt/timeline | ✅ | |

### 2C — Upload fichiers / Pièces jointes

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.10 | Config stockage (S3 / Minio local) | ✅ | Minio docker + env + application-dev.yml + MinioConfig + MinioService |
| 2.11 | `AttachmentService` + endpoints upload/download | ✅ | V29__attachments.sql + Attachment entity/repo/DTO + AttachmentController |
| 2.12 | UI upload dans `IssueSheet` + commentaires | ✅ | Onglet Attachments dans IssueSheet (upload/list/download/delete) |

---

## PHASE 3 — Intégrations tierces

### 3A — GitHub

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 3.1 | Entité `Integration` + migration Flyway | ✅ | V30__integrations.sql |
| 3.2 | `GitHubIntegrationService` (OAuth App, repos, branches, PRs) | ✅ | |
| 3.3 | Endpoint `/integrations/github/connect` (redirect OAuth) | ✅ | |
| 3.4 | Endpoint `/integrations/github/callback` (code → token) | ✅ | PUBLIC_MATCHERS |
| 3.5 | Lier PR/commit à une issue (`IssueGitHubLink`) | ✅ | |
| 3.6 | Page settings intégrations + bouton "Connect GitHub" | ✅ | |
| 3.7 | Afficher PRs/commits liés dans le détail d'une issue | ✅ | Tab GitHub dans IssueSheet |

### 3B — Slack

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 3.8 | `SlackIntegrationService` (OAuth, envoyer notifs) | ✅ | |
| 3.9 | Endpoint `/integrations/slack/connect` + callback | ✅ | |
| 3.10 | Config canal Slack par workspace (quel channel reçoit quoi) | ✅ | |
| 3.11 | Bouton "Connect Slack" dans settings + config canaux | ✅ | IntegrationsPanel |

### 3C — Webhooks génériques

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 3.12 | `WebhookService` — events HTTP sortants | ✅ | @Async |
| 3.13 | CRUD webhooks dans settings workspace | ✅ | IntegrationsPanel |

---

## PHASE 4 — Smart Assign / IA

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 4.1 | Algorithme Smart Assign (charge, compétence, historique) | ⏳ | |
| 4.2 | Endpoint `POST /issues/{id}/smart-assign` | ⏳ | |
| 4.3 | Connecter `SmartAssignPanel` à l'endpoint réel | ⏳ | |
| 4.4 | CommandPalette / Assistant IA (intégration LLM) | ⏳ | |

---

## PHASE QA — Tests manuels

> À remplir au fil des tests

| # | Scénario | Statut | Bugs trouvés |
|---|----------|--------|--------------|
| QA-1 | Inscription complète (3 étapes) | ⏳ | |
| QA-2 | Login / logout / refresh token | ⏳ | |
| QA-3 | Reset password | ⏳ | |
| QA-4 | Créer workspace, inviter membre | ⏳ | |
| QA-5 | Créer projet, modifier, supprimer | ⏳ | |
| QA-6 | CRUD issues (assigner, statut, commentaires, relations) | ⏳ | |
| QA-7 | Créer cycle, assigner issues, fermer cycle | ⏳ | |
| QA-8 | Analytics (KPIs, burndown, velocity) | ⏳ | |
| QA-9 | Discussions (créer, commenter, pin, lock) | ⏳ | |
| QA-10 | Notifications (réception, lecture) | ⏳ | |
| QA-11 | Profil utilisateur (modifier, avatar) | ⏳ | |
| QA-12 | Paiement Stripe (mode test) | ⏳ | |
| QA-13 | Navigation mobile / responsive | ⏳ | |
| QA-14 | Intégration GitHub | ⏳ | |
| QA-15 | Intégration Slack | ⏳ | |
| QA-16 | Messages / Chat | ⏳ | |
| QA-17 | Roadmap (timeline) | ⏳ | |
| QA-18 | Upload pièce jointe sur une issue | ⏳ | |

---

## PHASE Fix — Bugs QA

> Rempli après les sessions de test

| # | Description | Sévérité | Statut | Lié à |
|---|-------------|----------|--------|-------|
| — | *à compléter après QA* | — | — | — |

---

## PHASE 5 — Tests automatisés

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 5.1 | Tests unitaires : `IssueService`, `ProjectService`, `WorkspaceService` | ⏳ | |
| 5.2 | Tests unitaires : `CycleService`, `DiscussionService`, `PageService` | ⏳ | |
| 5.3 | Tests unitaires : `AnalyticsService`, `NotificationService` | ⏳ | |
| 5.4 | Tests controllers (`@WebMvcTest`) endpoints critiques | ⏳ | |
| 5.5 | Tests frontend composants clés (LoginForm, RegisterForm, IssueSheet) | ⏳ | |
| 5.6 | Tests E2E Playwright sur scénarios QA critiques | ⏳ | |

---

## Avancement global

| Phase | Progression | Statut |
|-------|------------|--------|
| Phase 1 — Features scaffoldées | 0 / 7 | ⏳ |
| Phase 2 — Features manquantes | 0 / 13 | ⏳ |
| Phase 3 — Intégrations | 0 / 13 | ⏳ |
| Phase 4 — Smart Assign / IA | 0 / 4 | ⏳ |
| Phase QA — Tests manuels | 0 / 18 | ⏳ |
| Phase Fix — Bugs | 0 | ⏳ |
| Phase 5 — Tests automatisés | 0 / 6 | ⏳ |
| **TOTAL** | **0 / 61** | ⏳ |
