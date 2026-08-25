---
title: Authentification
subtitle: Un jeton Bearer (JWT) sur chaque requête.
---

L'API s'authentifie par **jeton Bearer (JWT)**. La gestion des identités est assurée par un
**fournisseur OpenID Connect (Keycloak)** : ni le mot de passe ni le secret de double authentification
ne transitent par l'API TaskForce. Vous obtenez un jeton auprès du fournisseur, puis vous le présentez
à chaque appel.

## Envoyer le jeton

Ajoutez l'en-tête **`Authorization`** à chaque requête :

```bash
curl https://<instance>/api/workspaces/mon-espace/projects \
  -H "Authorization: Bearer <access_token>"
```

Le schéma de sécurité de la spécification s'appelle **`bearer-jwt`** ; la référence indique, pour
chaque endpoint, qu'il l'exige.

## Obtenir un jeton

Le jeton est émis par le **fournisseur d'identité** (Keycloak / OIDC) de votre instance, via son
**endpoint de token** OAuth 2.0. Vous échangez des identifiants contre un **access token** JWT :

```bash
curl -X POST https://<keycloak>/realms/<realm>/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=<client>" \
  -d "username=<email>" \
  -d "password=<mot_de_passe>"
```

→ la réponse contient un **`access_token`** (à présenter à l'API), un **`refresh_token`** et une
durée de validité **`expires_in`**.

<Info>
  Les valeurs exactes — hôte Keycloak, **realm**, **client**, type de flux — **dépendent de votre
  instance** et de son déploiement ; elles ne sont donc pas figées ici. Récupérez-les auprès de la
  configuration Keycloak de votre environnement.
</Info>

## Ce que contient le jeton

L'access token est un **JWT signé** qui porte l'**identité** de l'appelant (dont son email) et ses
**rôles**. L'API le vérifie à chaque appel et en déduit qui vous êtes et ce que vous avez le droit de
faire — vous n'avez rien à ajouter d'autre que l'en-tête `Authorization`.

## Rafraîchir avant l'expiration

Un access token est **de courte durée**. Plutôt que d'attendre le premier `401`, **renouvelez-le** avec
le `refresh_token` :

```bash
curl -X POST https://<keycloak>/realms/<realm>/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "client_id=<client>" \
  -d "refresh_token=<refresh_token>"
```

## Ce qui peut échouer

| Code | Sens | Que faire |
| --- | --- | --- |
| **401 Unauthorized** | Jeton absent, invalide ou **expiré**. | (Ré)obtenir / rafraîchir le jeton. |
| **403 Forbidden** | Jeton valide, mais **droits insuffisants** sur la ressource. | Vérifier le rôle requis. |

Un `403` n'est **pas** un problème d'authentification : vous êtes bien identifié, mais votre **rôle**
ne permet pas l'action. Les droits sont vérifiés **côté service**, selon votre rôle dans l'espace et
l'opération. → [Membres & rôles](/guides/membres-et-roles)

<Warning>
  Ne stockez **jamais** un secret d'authentification (mot de passe, `refresh_token`, secret de client)
  en clair dans un client public — front web, application mobile. Les échanges se font en **HTTPS**.
</Warning>
