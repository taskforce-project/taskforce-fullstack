---
title: Bonnes pratiques
subtitle: Intégrer l'API proprement et durablement.
---

Quelques réflexes pour une intégration robuste, qui vieillit bien.

## Respecter la limite de débit

- Surveillez **`X-RateLimit-Remaining`** et **ralentissez** avant d'atteindre zéro.
- Sur un **429**, **attendez** la durée indiquée par **`Retry-After`** avant de réessayer — pas moins.
- Adoptez un **back-off** (exponentiel) sur les reprises, plutôt qu'une boucle serrée.

## Gérer l'authentification

- Anticipez l'**expiration** du jeton (rafraîchissement) au lieu de subir le premier `401`.
- Ne placez **jamais** un secret d'authentification dans un client public (front, mobile) en clair.
- Un `403` n'est pas un problème d'authentification mais de **droits** : vérifiez le rôle requis.

## Lire les réponses correctement

- La charge utile est dans **`data`** ; contrôlez **`success`** et gérez les cas d'erreur via
  **`message`**.
- Traitez tout **non-2xx** comme une erreur, sans supposer la forme du corps sur un `429` (filtre en
  amont, cf. [Conventions](/api/api-conventions)).

## Parcourir les listes

- **Paginez** (`page`, `size`, `sort`) plutôt que de demander des tailles démesurées.
- Itérez jusqu'à `totalPages`, en gardant des pages raisonnables.

## S'appuyer sur le contrat

- La **spécification OpenAPI** est la source de vérité. Générez-en un **client** (SDK, collection
  Postman/Insomnia) au lieu d'écrire les appels à la main.
- Les **intégrations** et **webhooks** se configurent côté espace, et sont réservés aux
  **Propriétaires / Admins**. → [Intégrations](/guides/integrations)

<Tip>
  Concevez vos traitements comme **rejouables** : en cas de reprise après erreur réseau ou 429, votre
  intégration doit pouvoir répéter un appel sans effet de bord surprenant.
</Tip>
