---
title: Introduction
subtitle: L'API REST de TaskForce, en bref.
---

TaskForce expose une **API REST** décrite en **OpenAPI 3.1**. La [référence](/api) — endpoints,
schémas, exemples — est **générée depuis cette spécification** ; les guides de cette section en
donnent les règles communes.

## Base & format

- **Toutes les routes sont préfixées par `/api`**. Exemple :
  `GET /api/workspaces/{slug}/projects`.
- Les échanges sont en **JSON** (`Content-Type: application/json`).
- Les ressources sont **scopées** : la plupart des routes portent le **slug de l'espace** et, souvent,
  un **id d'opération** — `…/workspaces/{slug}/projects/{projectId}/issues`.

## L'enveloppe de réponse

Chaque réponse est encapsulée dans une enveloppe `ApiResponse<T>` — **le corps utile est dans `data`** :

```json
{
  "success": true,
  "message": "Issue created",
  "data": { "id": 42, "identifier": "WEB-42", "title": "…" },
  "timestamp": "2026-08-25T14:12:00"
}
```

Côté client, on lit donc la charge utile via le champ **`data`** (et l'on peut vérifier `success`).

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
  La spécification OpenAPI est le contrat de référence. Vous pouvez la donner à un générateur de client
  (SDK, Postman, Insomnia…) pour créer vos appels sans les écrire à la main.
</Tip>
