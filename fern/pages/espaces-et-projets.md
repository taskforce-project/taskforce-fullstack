---
title: Espaces & projets
subtitle: Espaces de travail personnels vs partagés, et organisation des projets.
---

## Espaces de travail

Un **espace de travail** regroupe une équipe, ses projets et sa base de connaissance. À la manière des
organisations GitHub, on distingue :

- **Votre espace personnel** — créé automatiquement à l'inscription, dont vous êtes propriétaire.
- **Les espaces partagés** — ceux dont vous êtes membre après avoir été invité.

Le **nom d'un espace n'est pas unique** : plusieurs espaces peuvent s'appeler « Demo ». Ce qui est
unique, c'est son **identifiant d'URL** (slug), rendu unique automatiquement.

<Info>
La limite de création d'espaces dépend de votre offre et compte les espaces que **vous possédez**, pas
ceux où vous êtes invité — être membre de dix organisations ne consomme pas votre quota.
</Info>

## Projets

Un projet regroupe des issues, des membres et des labels, à l'intérieur d'un espace.

- **Nom** : libre, jamais unique. Deux projets « Refonte » peuvent coexister.
- **Préfixe d'issue** (identifiant, ex. `WEB`) : **unique par espace**, il préfixe les tickets (`WEB-1`).
  En cas de collision dans le même espace, il est **auto-suffixé** (`WEB` → `WEB2`).
- **Visibilité** : **public** (visible de tous les membres de l'espace) ou **privé** (membres explicites).

C'est donc **l'identifiant qui prime, pas le nom** — le nom reste à votre main.
