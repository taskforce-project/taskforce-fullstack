---
title: Introduction
subtitle: L'API REST de TaskForce, en bref.
---

TaskForce expose une **API REST** décrite en **OpenAPI 3.1**. La [référence](/api) — endpoints,
schémas, exemples de corps — est **générée depuis cette spécification**, donc toujours alignée sur le
comportement réel du serveur. Les guides de cette section en donnent les **règles communes**, celles
qui s'appliquent partout et qu'on ne relit pas sur chaque route.

## Base & format

- **Toutes les routes sont préfixées par `/api`**. Exemple : `GET /api/workspaces/{slug}/projects`.
- Les échanges sont en **JSON** (`Content-Type: application/json`).
- Il n'y a **pas de version dans le chemin** : la référence OpenAPI fait foi pour le contrat courant.

### Le scoping des ressources

La plupart des routes sont **imbriquées** et portent leur contexte dans le chemin : le **slug de
l'espace**, puis souvent un **id d'opération**, puis la ressource. La hiérarchie de l'URL reflète celle
du produit :

```
/api/workspaces/{slug}/projects/{projectId}/issues/{issueId}
        └ espace       └ opération        └ tâche
```

## L'enveloppe de réponse

Chaque réponse — succès **ou** erreur — est encapsulée dans une enveloppe `ApiResponse<T>`. **Le corps
utile est dans `data`** :

```json
{
  "success": true,
  "message": "Issue created",
  "data": { "id": 42, "identifier": "WEB-42", "title": "Fix login" },
  "timestamp": "2026-08-25T14:12:00"
}
```

Côté client : lisez la charge utile via **`data`**, contrôlez **`success`**, affichez ou journalisez
**`message`**. Le détail (erreurs, pagination, codes) est dans [Conventions](/api/api-conventions).

## Un appel de bout en bout

```bash
curl -X POST https://<instance>/api/workspaces/acme/projects/12/issues \
  -H "Authorization: Bearer <jeton_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Fix login", "priority": "HIGH" }'
```

→ réponse `201 Created`, l'issue créée dans `data`.

## Ce que couvre la référence

La [référence](/api) regroupe les **~235 opérations** de l'API par domaine — parmi lesquels :

- **Workspaces, Projects, Issues, Cycles, Pages, Roadmap** — le cœur du travail ;
- **Teams, Users, Invitations, Members, Assignments, Notifications** — la collaboration ;
- **AI assistant, AI analysis, Smart Assign, Brain OS** — les capacités Cortex ;
- **Analytics, Dashboard, Integrations, Webhooks, Billing** — le pilotage et l'écosystème.

## Pour commencer

<CardGroup cols={2}>
  <Card title="Authentification" icon="key" href="/api/api-authentification">
    Obtenir un jeton et l'envoyer à chaque requête.
  </Card>
  <Card title="Conventions" icon="list-check" href="/api/api-conventions">
    Enveloppe, erreurs, pagination, codes HTTP.
  </Card>
  <Card title="Bonnes pratiques" icon="shield-halved" href="/api/api-bonnes-pratiques">
    Limites de débit, reprises, robustesse.
  </Card>
  <Card title="Référence API" icon="code" href="/api">
    Tous les endpoints, générés depuis l'OpenAPI.
  </Card>
</CardGroup>

<Tip>
  La spécification OpenAPI est le **contrat**. Donnez-la à un générateur de client (SDK, collection
  Postman/Insomnia) pour créer vos appels sans les écrire à la main.
</Tip>
