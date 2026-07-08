# Mapping intégrations — GitHub (bidirectionnel), Slack, Chat-as-app

> **But** : cartographier *exactement* les actions (entrée → sortie) et **sur quelle vue** elles se passent, **avant** tout ajout/refactor. Rien d'inventé : la colonne « Statut » distingue **✅ existe**, **🟠 partiel**, **🔴 à construire**.
> Date : 07/07/2026 · Auteur : mapping pré-implémentation.

---

## 0. État actuel (démontrable dans le code)

**Modèle** : `Workspace` → `Project` (`{name, identifier}`) → `Issue` / `Cycle` / `ProjectLabel` / `Page`. **Pas d'entité `Organization`** (le plus proche = `Workspace`).

| Domaine | Ce qui existe vraiment |
|---|---|
| **GitHub** | OAuth connect/callback/status/disconnect · **lecture** repos (`/github/repos`) + issues d'un repo (`/github/issues?repo=`) · attacher **manuellement** une PR/commit à une issue TaskForce (`issue_github_links`). **Rien** d'import repo→projet, sync labels/issues, ni écriture vers GitHub. |
| **Slack** | connect · push events (`notifyEvent`) · **miroir entrant** (import messages → canal chat) + poller. Manque : sens sortant (TaskForce → Slack). |
| **Chat** | `/messages` : canaux + messages + temps réel (STOMP) + réception du miroir Slack. Pas de DM/threads/présence/unread. |

**Vues existantes concernées** : Projects `…/projects` · New project `…/projects/new` · Projet `…/projects/[id]` (+ `issues`, `list`, `backlog`, `settings`, `members`, `roadmap`, `pages`) · Issue `…/projects/[id]/issues/[issueId]` · Settings→Integrations `…/settings` · Chat `…/messages`.

---

## 1. GitHub — cible bidirectionnelle

### 1.A — Sens **GitHub → TaskForce** (« récupérer »)

| # | Action | Entrée | Sortie | Vue | Statut |
|---|---|---|---|---|---|
| G1 | Lister comptes/orgs + repos accessibles | token connecté | liste orgs → repos | **Projects** → dialog « Importer depuis GitHub » | 🟠 (repos listés, pas les orgs) |
| G2 | (option) Créer un Workspace « org » avant import | nom | nouveau Workspace | **Projects / switcher workspace** | ✅ (workspace) 🔴 (lien GitHub org) |
| G3 | **Importer un repo → Projet** | repo `owner/name` | `Project` lié (`github_repo`), identifier auto | **Projects list / New project** | 🔴 |
| G4 | Importer les **labels** | repo lié | `ProjectLabel`s (nom+couleur mappés, `external_id`) | Project **settings** | 🔴 |
| G5 | Importer les **issues** | repo lié | `Issue`s TaskForce (titre, body, état, labels, assignee si mappable, `github_issue_number`) | Project **issues/board** | 🔴 |
| G6 | **Re-sync** (import continu) | repo lié | maj des issues importées (dédup par `github_issue_number`) | Project settings / bouton **Sync** | 🔴 |

### 1.B — Sens **TaskForce → GitHub** (« interagir / voir l'impact »)

| # | Action | Entrée | Sortie | Vue | Statut |
|---|---|---|---|---|---|
| G7 | Créer une **issue GitHub** depuis une issue TaskForce | issue TF | issue GitHub créée + liée | **Issue detail** | 🔴 |
| G8 | Pousser **état** (open/closed) | issue TF (statut catégorie) | issue GitHub open/closed | Issue detail / **board** | 🔴 |
| G9 | Pousser un **commentaire** | commentaire TF | commentaire GitHub | Issue detail | 🔴 |
| G10 | Voir l'**impact / état de sync** | issue liée | badge `synced / diverged`, lien GitHub, dernier sync | Issue detail / board | 🔴 |
| G11 | Lier une **PR/commit** à une issue (existant) | URL PR/commit | `issue_github_links` | Issue detail | ✅ |

### 1.C — **2-way sync** (le vrai chantier)
Détection des changements GitHub → TaskForce : **webhooks GitHub** (temps réel, besoin URL publique) *ou* **polling** (`conversations`-style, simple en local). Résolution de conflits (last-write-wins par champ, ou timestamp). File d'events + idempotence par `github_node_id`.

---

## 2. Modèle de données requis (nouveau)

| Table | Ajouts |
|---|---|
| `projects` | `github_repo` (owner/name), `github_sync_enabled`, `github_last_sync_at` |
| `issues` | `github_issue_number`, `github_node_id`, `github_sync_state` |
| `project_labels` | `external_source`, `external_id` (mapping label GitHub) |
| (existant) `issue_github_links` | conservé pour les liens PR/commit |
| (option 2-way) `github_webhook_events` | file d'events entrants (idempotence) |

---

## 3. Slack — cible

| # | Action | Entrée | Sortie | Vue | Statut |
|---|---|---|---|---|---|
| S1 | Connect / status / disconnect | — | intégration | Settings→Integrations | ✅ |
| S2 | Push events (issue/comment/cycle) | event TF | message Slack | (déclenché serveur) | ✅ |
| S3 | **Miroir entrant** (import messages) | canal Slack | messages dans canal chat + temps réel | Chat `…/messages` | ✅ |
| S4 | Poller auto | — | sync périodique | (serveur) | ✅ |
| S5 | **Sortant / bidirectionnel** : écrire dans le canal miroir TaskForce → renvoyer vers Slack | message TF dans canal miroir | `chat.postMessage` vers Slack | Chat `…/messages` | 🔴 |
| S6 | Choisir quels canaux Slack rapatrier (picker) | liste canaux Slack (`conversations.list`) | canaux miroirs créés | Settings→Integrations | 🟠 (ajout manuel par ID aujourd'hui) |

---

## 4. Chat — « en faire une app »

Aujourd'hui = canaux + messages + temps réel + réception miroir. Pour un vrai chat first-class :

| # | Action | Entrée | Sortie | Vue | Statut |
|---|---|---|---|---|---|
| C1 | Canaux + messages + temps réel | — | — | `…/messages` | ✅ |
| C2 | **DM** (1-1) | user cible | canal DM | `…/messages` | 🔴 |
| C3 | **Threads** (réponses) | message parent | fil | `…/messages` | 🔴 |
| C4 | **Unread / présence / typing** | — | badges, indicateurs | sidebar chat | 🔴 |
| C5 | Réactions / pin / edit / delete | — | — | message-bubble | 🟠 (edit/delete oui, réactions UI mock) |
| C6 | Canal miroir Slack = canal chat natif | (S3) | — | `…/messages` | ✅ |

---

## 5. Décisions à trancher AVANT de coder (forks)

> **✅ Validé (07/07)** : **on reste sur l'OAuth App** et on en tire le max (le scope `repo` permet lecture **et** écriture → T1 import + T2 push OK). Le 2-way *live* (webhooks natifs) attendra une éventuelle GitHub App ; d'ici là, refresh par **polling / bouton Sync**. **Org → Workspace, repo → Projet.** **Démarrage : T1 (Import).**


1. **« Org »** — TaskForce n'a pas d'orgs. *Reco* : **GitHub org → Workspace**, **GitHub repo → Project**. (Sinon : introduire une vraie entité Organization = gros refactor transverse.)
2. **OAuth App vs GitHub App** — l'OAuth App actuelle suffit pour *lire*. Pour l'import par repo, l'écriture et surtout les **webhooks natifs** (2-way), une **GitHub App** est bien plus adaptée (install par repo, permissions granulaires, webhooks intégrés). *Reco* : **migrer vers GitHub App** pour ce chantier (c'est aussi ce qui donne le « autoriser tel repo » que tu voulais).
3. **Sync** — *Reco* : livrer **par tranches**, pas le 2-way d'un coup :
   - **T1 Import** (G1-G6) : repo→projet + issues + labels, **sens unique** GitHub→TF. Le plus de valeur, le moins risqué.
   - **T2 Push** (G7-G10) : create/close/comment issue GitHub depuis TF.
   - **T3 2-way** : webhooks GitHub App + résolution de conflits.
   - **T4 Slack sortant** (S5) + **S6 picker**.
   - **T5 Chat-as-app** (C2-C5).
4. **Conflits (T3)** — last-write-wins global, ou par champ (titre/état/labels indépendants) ? *Reco* : par champ + `updated_at` gardien.
5. **Latence** — webhooks (temps réel, URL publique via tunnel/prod) vs polling (simple, local). *Reco* : polling pour dev, webhooks en prod (GitHub App les fournit).

---

## 6. Prochaine étape
Valider **§5** (surtout : GitHub App oui/non, et l'ordre des tranches). Une fois tranché, on attaque **T1 (Import)** — la brique qui débloque « je connecte GitHub → je récupère un repo comme projet avec ses issues/labels ».
