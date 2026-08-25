---
title: Bonnes pratiques
subtitle: Intégrer l'API proprement et durablement.
---

Quelques réflexes pour une intégration robuste, qui vieillit bien.

## Respecter la limite de débit

- Surveillez **`X-RateLimit-Remaining`** et **ralentissez** avant d'atteindre zéro.
- Sur un **429**, **attendez** la durée indiquée par **`Retry-After`** avant de réessayer — pas moins.
- Adoptez un **back-off** (exponentiel) sur les reprises, plutôt qu'une boucle serrée :

```js
async function call(req, tentative = 0) {
  const res = await fetch(req);
  if (res.status === 429) {
    const attente = Number(res.headers.get("Retry-After") ?? 2 ** tentative);
    await sleep(attente * 1000);
    return call(req, tentative + 1);      // réessai après la fenêtre indiquée
  }
  return res;
}
```

## Gérer l'authentification

- Anticipez l'**expiration** du jeton (rafraîchissement) au lieu de subir le premier `401`.
  → [Authentification](/api/api-authentification)
- Ne placez **jamais** un secret d'authentification dans un client public (front, mobile) en clair.
- Un `403` n'est pas un problème d'authentification mais de **droits** : vérifiez le rôle requis.

## Lire les réponses correctement

- La charge utile est dans **`data`** ; contrôlez **`success`** et gérez les cas d'erreur via
  **`message`**.
- Traitez tout **non-2xx** comme une erreur, sans supposer la forme du corps sur un `429` (filtre en
  amont, cf. [Conventions](/api/api-conventions)).

## Parcourir les listes

**Paginez** plutôt que de demander des tailles démesurées ; itérez jusqu'à `totalPages` :

```js
let page = 0, out = [];
do {
  const { data } = await get(`/api/.../issues?page=${page}&size=50`);
  out.push(...data.content);
  page++;
} while (page < data.totalPages);
```

## Consommer les webhooks

Si vous branchez des **webhooks** pour réagir aux événements de TaskForce :

- Rendez votre endpoint **idempotent** — le même événement peut être livré plus d'une fois ; un
  traitement rejouable ne double pas les effets.
- Répondez **vite** (un `2xx`) et faites le travail lourd **en tâche de fond**, pour ne pas bloquer
  l'émetteur.
- La configuration des **intégrations** et **webhooks** est réservée aux **Propriétaires / Admins** de
  l'espace. → [Intégrations](/guides/integrations)

## S'appuyer sur le contrat

La **spécification OpenAPI** est la source de vérité. Générez-en un **client** (SDK, collection
Postman/Insomnia) au lieu d'écrire les appels à la main : votre code reste aligné sur l'API, et les
changements de contrat se voient à la génération.

<Tip>
  Concevez vos traitements comme **rejouables** : après une erreur réseau, un `429` ou une livraison
  de webhook en double, votre intégration doit pouvoir **répéter un appel sans effet de bord
  surprenant**. C'est la propriété qui distingue une intégration solide d'une intégration fragile.
</Tip>
