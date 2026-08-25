---
title: Conventions
subtitle: Enveloppe, méthodes, erreurs, pagination, codes HTTP.
---

Ces règles s'appliquent à **tous** les endpoints. Les connaître dispense de les relire sur chaque
route.

## Le préfixe `/api`

Toute route porte le préfixe **`/api`**. Il n'y a pas de version dans le chemin — la référence OpenAPI
fait foi pour le contrat courant.

## Méthodes HTTP

L'API suit les conventions REST habituelles :

| Méthode | Usage |
| --- | --- |
| **GET** | Lire une ressource ou une liste. Sans effet de bord. |
| **POST** | Créer une ressource, ou déclencher une action. |
| **PUT / PATCH** | Mettre à jour (remplacement / modification partielle). |
| **DELETE** | Supprimer. |

## L'enveloppe `ApiResponse<T>`

Succès comme erreur, le corps suit la même forme :

```json
{
  "success": true,
  "message": "…",
  "data": { },
  "timestamp": "2026-08-25T14:12:00"
}
```

- **`success`** — booléen, l'issue de la requête.
- **`message`** — libellé lisible (utile pour l'affichage / le log).
- **`data`** — **la charge utile** (objet, liste, ou `null` en cas d'erreur).
- **`timestamp`** — l'horodatage de la réponse.

## Codes de statut

| Code | Quand |
| --- | --- |
| **200 / 201** | Succès (201 à la création). |
| **400 Bad Request** | Corps invalide — échec de validation. |
| **401 / 403** | Non authentifié / droits insuffisants. → [Authentification](/api/api-authentification) |
| **404 Not Found** | Ressource introuvable ou hors de votre périmètre. |
| **409 Conflict** | Conflit d'état (ex. doublon, contrainte). |
| **429 Too Many Requests** | Limite de débit atteinte (voir ci-dessous). |
| **5xx** | Erreur serveur. |

En cas d'erreur applicative, l'enveloppe passe `success: false` et **`message`** décrit le problème
(`data` vaut alors `null`) :

```json
{
  "success": false,
  "message": "La priorité doit être l'une de : NONE, LOW, MEDIUM, HIGH, URGENT",
  "data": null,
  "timestamp": "2026-08-25T14:12:00"
}
```

Traitez donc **tout non-2xx** comme une erreur, et affichez / journalisez `message`.

## Pagination

Les listes volumineuses sont **paginées**. Passez ces paramètres de requête :

```
?page=0&size=30&sort=createdAt,desc
```

- **`page`** — index de page, à partir de `0` (défaut `0`).
- **`size`** — taille de page (défaut `30`).
- **`sort`** — champ + sens (`asc` / `desc`).

La réponse place un **`PageResponse<T>`** dans `data` — il contient les éléments (`content`), la page
courante et sa taille (`pageNumber`, `pageSize`), et le total (nombre d'éléments et de pages) :

```json
{
  "success": true,
  "data": {
    "content": [ /* … */ ],
    "pageNumber": 0,
    "pageSize": 30,
    "totalElements": 128,
    "totalPages": 5
  }
}
```

## Limite de débit

L'API applique une **limite de débit par IP**. Deux en-têtes vous guident :

- **`X-RateLimit-Remaining`** — le crédit restant (présent sur les réponses) : levez le pied avant le mur.
- **`Retry-After`** — sur un **429**, le nombre de **secondes** à attendre avant de réessayer.

<Note>
  Le corps d'un **429** provient d'un filtre en amont et adopte une forme courte
  (`{"error":"Too Many Requests","message":"…"}`) plutôt que l'enveloppe `ApiResponse`. Fiez-vous au
  **code 429** et à l'en-tête **`Retry-After`**.
</Note>

## Formats

- **Identifiants** : numériques (ex. `projectId`, `issueId`) ; certaines ressources ont aussi un
  **identifiant lisible** (ex. tâche `WEB-42`).
- **Dates** : au format **ISO 8601**.
- **Périmètre** : `slug` d'espace et `id` d'opération dans le chemin, selon la ressource.
