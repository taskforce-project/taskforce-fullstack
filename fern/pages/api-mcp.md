---
title: Piloter depuis un agent (MCP)
subtitle: Les routes utiles pour conduire TaskForce depuis un agent ou un serveur MCP.
---

TaskForce fournit un **serveur MCP** (*Model Context Protocol*) qui expose l'application comme un jeu
d'**outils** à un agent IA (Claude et autres). Cette page recense les routes de l'API les plus utiles
pour **piloter TaskForce depuis un agent** — que vous branchiez le serveur MCP fourni ou que vous
construisiez le vôtre.

Toutes les routes ci-dessous suivent les [conventions](/api/api-conventions) (préfixe `/api`, enveloppe
`ApiResponse`) et exigent un jeton [Bearer](/api/api-authentification) — typiquement un **compte de
service** dédié à l'agent.

## Le principe : contextualiser → décider → agir

Un bon agent ne fonce pas : il **se renseigne** avant d'écrire. Le fil recommandé :

<Steps>
  <Step title="Contextualiser">
    Interroger **Cortex** et le **Brain OS** (décisions, architecture, problèmes connus), lire les
    **KPIs** et les **issues** concernées.
  </Step>
  <Step title="Décider">
    S'appuyer sur l'IA — **Smart Assign** pour le bon responsable, **génération de spec** pour cadrer
    une tâche.
  </Step>
  <Step title="Agir">
    Créer / mettre à jour des issues, commenter, ranger dans un sprint — une fois le contexte réuni.
  </Step>
</Steps>

## Le serveur MCP de TaskForce (10 outils)

Le serveur `taskforce-mcp` expose **10 outils** (7 lecture, 3 écriture), chacun câblé sur une route :

| Outil MCP | Route appelée | Rôle |
| --- | --- | --- |
| `taskforce_ask_cortex` | `POST /workspaces/{slug}/assistant` | Interroger Cortex (RAG sur le Brain OS) + sources |
| `taskforce_workspace_kpis` | `GET /workspaces/{slug}/analytics/kpis` | Santé du workspace (vélocité, en cours, à risque) |
| `taskforce_list_projects` | `GET /workspaces/{slug}/projects` | Lister les opérations |
| `taskforce_list_my_issues` | `GET /workspaces/{slug}/my-issues` | Les tâches assignées au porteur du jeton |
| `taskforce_brain_search` | `POST /workspaces/{slug}/brain/search` | Recherche sémantique dans le Brain OS |
| `taskforce_list_issues` | `GET /workspaces/{slug}/projects/{projectId}/issues` | Lister les tâches d'une opération |
| `taskforce_list_issue_statuses` | `GET .../projects/{projectId}/issues/statuses` | Résoudre un `statusId` |
| `taskforce_create_issue` | `POST .../projects/{projectId}/issues` | **Créer** une tâche |
| `taskforce_update_issue` | `PATCH .../projects/{projectId}/issues/{issueId}` | **Mettre à jour** (statut, assigné, priorité…) |
| `taskforce_smart_assign` | `POST .../issues/{issueId}/smart-assign` | Recommander un assigné (à appliquer via update) |

## Les routes utiles à un agent

Au-delà des 10 outils fournis, voici l'ensemble des routes qu'un agent voudra mobiliser, par intention.

### 1 · Se renseigner (lecture)

| Route | Ce qu'elle donne |
| --- | --- |
| `POST /workspaces/{slug}/assistant` | La réponse de Cortex, fondée sur le Brain OS, avec ses sources. |
| `POST /workspaces/{slug}/brain/search` | Recherche sémantique dans la mémoire (filtrable par domaine). |
| `GET /workspaces/{slug}/analytics/kpis` | Les indicateurs de santé du workspace. |
| `GET /workspaces` · `GET /workspaces/{slug}` | Les espaces accessibles, le détail d'un espace. |
| `GET /workspaces/{slug}/projects` · `.../projects/{id}` | Les opérations, le détail d'une opération. |
| `GET .../projects/{projectId}/issues` · `.../issues/paged` | Les tâches (liste simple ou paginée). |
| `GET .../issues/{issueId}` | Le détail d'une tâche. |
| `GET .../issues/{issueId}/comments` · `.../activity` · `.../children` · `.../relations` | Discussion, journal, sous-tâches, liens. |
| `GET .../issues/statuses` · `.../issues/types` | Les statuts et types de l'opération (pour résoudre les ids). |
| `GET /workspaces/{slug}/members` · `.../projects/{id}/members` | Les personnes (pour résoudre un `assigneeId`). |
| `GET /workspaces/{slug}/my-issues` · `my-cycles` · `my-pages` | Le périmètre du porteur du jeton, tous projets confondus. |
| `GET .../projects/{projectId}/cycles` · `.../cycles/{id}/issues` | Les sprints et leur contenu. |
| `GET .../projects/{projectId}/pages` · `.../pages/{id}` | Les documents d'une opération. |
| `GET /workspaces/{slug}/roadmap` | La feuille de route de l'espace. |

### 2 · Décider (IA)

| Route | Ce qu'elle fait |
| --- | --- |
| `POST .../issues/{issueId}/smart-assign` | Recommande le meilleur assigné (compétences + charge + historique). |
| `POST .../issues/smart-assign/preview` | Suggestion pour une tâche **avant** création (dry-run). |
| `POST .../issues/smart-assign/bulk` | Recommandations **en lot** pour plusieurs tâches. |
| `POST .../issues/{issueId}/ai/spec` | Génère un **brouillon de spécification** pour une tâche. |
| `POST .../issues/{issueId}/ai/spec/approve` | Applique la spec générée (human-in-the-loop). |

### 3 · Agir (écriture)

| Route | Ce qu'elle fait |
| --- | --- |
| `POST .../projects/{projectId}/issues` | **Créer** une tâche. |
| `PATCH .../issues/{issueId}` | **Mettre à jour** : statut, assigné, priorité, titre, dates… |
| `POST .../issues/{issueId}/comments` | Commenter une tâche. |
| `POST .../issues/{issueId}/relations` | Relier deux tâches (bloque, doublon, liée…). |
| `PATCH .../issues/{issueId}/archive` · `.../pin` | Archiver / épingler. |
| `POST .../projects/{projectId}/cycles` · `.../cycles/{cycleId}/issues` | Créer un sprint, y ranger une tâche. |
| `POST .../projects/{projectId}/pages` · `PATCH .../pages/{pageId}` | Créer / modifier une page. |
| `POST /workspaces/{slug}/projects` | Créer une opération. |
| `POST /me/assignments/{issueId}/accept` · `.../decline` | **Accepter / refuser** une assignation reçue. → [Assignations](/guides/assignations) |

## Résoudre les identifiants

Les écritures attendent des **ids numériques**. L'agent les résout d'abord par des lectures :

- **`projectId`** ← `GET /workspaces/{slug}/projects`
- **`statusId`** ← `GET .../issues/statuses` (pour un changement de statut)
- **`assigneeId`** ← `GET /workspaces/{slug}/members` ou `smart-assign`
- **`issueId`** ← `GET .../issues`

<Tip>
  Motif **lire-avant-écrire** : un agent fiable enchaîne *lister les statuts → mettre à jour avec le
  bon `statusId`*, *Smart Assign → appliquer l'`assigneeId`*. Il ne devine pas les ids, il les
  **résout**.
</Tip>

<Note>
  La [référence API](/api) documente le corps exact (schémas, exemples) de chacune de ces routes.
  Cette page en donne la **carte agent** ; la référence, le **détail**.
</Note>
