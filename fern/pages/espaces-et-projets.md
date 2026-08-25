---
title: Espaces & projets
subtitle: Votre espace de travail et les opérations qu'il contient.
---

## Espace de travail

Un **espace de travail** regroupe une équipe, ses **opérations** et sa base de connaissance. Vous
disposez d'un **espace personnel** (créé à l'inscription) et pouvez rejoindre des **espaces partagés**
sur invitation.

Le **sélecteur d'espace**, en haut de la barre latérale, permet de basculer de l'un à l'autre. Chaque
espace est étanche : ses opérations, ses membres et sa mémoire lui sont propres.

<Info>
  Un espace = une équipe = un **Brain OS**. La mémoire (base de connaissance) est attachée à l'espace,
  pas à une opération en particulier. → [Mémoire](/guides/memoire)
</Info>

## Créer une opération

Une **opération** est un projet. Créez-en une depuis le bouton **Nouveau projet** (barre latérale),
la tuile du Dashboard, ou `Ctrl + K`. Le formulaire s'ouvre **sans quitter votre écran**.

<Steps>
  <Step title="Nom & icône">
    Donnez un **nom** à l'opération et, si vous le souhaitez, choisissez une **icône** et une
    **couleur** — son identité visuelle dans toute l'application.
  </Step>
  <Step title="Préfixe (identifiant)">
    Le **préfixe** numérote les tâches de l'opération (ex. `WEB` → `WEB-42`). TaskForce le **dérive
    automatiquement** du nom (les premières lettres), mais vous pouvez le personnaliser. Il est court
    et unique dans l'espace.
  </Step>
  <Step title="Description & visibilité">
    Ajoutez une **description** (optionnelle) et choisissez la **visibilité** — publique ou privée
    (voir ci-dessous). Validez : vous arrivez directement dans l'opération.
  </Step>
</Steps>

{/* SCREENSHOT: projet-creation — la fenêtre « Créer un projet » (nom, préfixe, couleur, visibilité) */}

## Visibilité : publique ou privée

Au sein d'un espace, chaque opération a une **visibilité** :

| Visibilité | Qui y a accès |
| --- | --- |
| **Publique** | Tous les membres de l'espace la voient et peuvent y contribuer (selon leur rôle). |
| **Privée** | Seuls les **collaborateurs explicitement ajoutés** y ont accès. |

Par défaut, une nouvelle opération est **privée**. La visibilité et les droits d'écriture dépendent
ensuite du **rôle** de chacun. → [Membres & rôles](/guides/membres-et-roles)

## Ce que contient une opération

Une fois l'opération ouverte, vous y retrouvez tout ce qui lui est rattaché :

<CardGroup cols={2}>
  <Card title="Tâches & tableaux" icon="list-check" href="/guides/issues-et-tableaux">
    Les tickets, en vues Liste, Kanban et Backlog.
  </Card>
  <Card title="Sprints" icon="rotate" href="/guides/cycles">
    Le travail regroupé sur des périodes bornées.
  </Card>
  <Card title="Feuille de route" icon="chart-gantt" href="/guides/roadmap">
    Les jalons de l'opération dans le temps.
  </Card>
  <Card title="Pages" icon="file-lines" href="/guides/pages">
    Les documents (specs, notes) de l'opération.
  </Card>
  <Card title="Membres" icon="users" href="/guides/membres-et-roles">
    Qui travaille sur l'opération, et avec quels droits.
  </Card>
  <Card title="Paramètres" icon="gear">
    Nom, préfixe, statuts et types de tâches, couleur.
  </Card>
</CardGroup>

<Tip>
  Les **statuts** et **types de tâches** sont personnalisables **par opération** (dans ses Paramètres) :
  chaque équipe adapte son flux de travail. Détails dans [Issues & tableaux](/guides/issues-et-tableaux).
</Tip>
