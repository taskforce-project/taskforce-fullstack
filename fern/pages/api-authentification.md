---
title: Authentification
subtitle: Un jeton Bearer (JWT) sur chaque requête.
---

L'API s'authentifie par **jeton Bearer (JWT)**. La gestion des identités est assurée par un
**fournisseur OpenID Connect (Keycloak)** : ni le mot de passe ni le secret de double authentification
ne transitent par l'API TaskForce.

## Envoyer le jeton

Ajoutez l'en-tête **`Authorization`** à chaque appel :

```bash
curl https://<votre-instance>/api/workspaces/mon-espace/projects \
  -H "Authorization: Bearer <votre_jeton_jwt>"
```

Le schéma de sécurité de la spécification s'appelle **`bearer-jwt`** ; la référence indique, pour
chaque endpoint, qu'il l'exige.

## Obtenir un jeton

Le jeton est émis par le **fournisseur d'identité** (Keycloak / OIDC) de votre instance, via son
**endpoint de token** OAuth 2.0. Concrètement, vous échangez des identifiants (ou un flux OAuth) contre
un **access token** JWT, que vous présentez ensuite à l'API.

<Info>
  Les URL exactes (émetteur, realm, endpoint de token, client) **dépendent de votre instance** et de
  son déploiement — elles ne sont donc pas figées ici. Récupérez-les auprès de la configuration
  Keycloak de votre environnement.
</Info>

## Ce qui peut échouer

| Code | Sens |
| --- | --- |
| **401 Unauthorized** | Jeton absent, invalide ou expiré. |
| **403 Forbidden** | Jeton valide, mais **droits insuffisants** sur la ressource. |

Les droits sont vérifiés **côté service**, selon votre **rôle** dans l'espace et l'opération.
→ [Membres & rôles](/guides/membres-et-roles)

<Warning>
  Un access token a une **durée de vie limitée**. Anticipez son expiration (rafraîchissement) plutôt
  que d'attendre le premier 401. Ne stockez jamais de secret d'authentification côté client public.
</Warning>
