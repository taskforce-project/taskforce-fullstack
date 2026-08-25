---
title: Espaces & projets
subtitle: Votre espace de travail et les opérations qu'il contient.
---

## Espace de travail

Un **espace de travail** est le contenant de tout : une équipe, ses **opérations** et sa base de
connaissance. Il est **étanche** — ses opérations, ses membres et sa mémoire lui sont propres et ne
débordent pas sur un autre espace.

Vous disposez toujours d'un **espace personnel**, créé automatiquement à l'inscription, et vous pouvez
**rejoindre des espaces partagés** sur invitation. Le **sélecteur d'espace**, en haut de la barre
latérale, permet de basculer de l'un à l'autre en un clic — pratique quand vous cloisonnez vos projets
perso et ceux d'une équipe.

<Info>
  Un espace = une équipe = un **Brain OS**. La mémoire (base de connaissance) est attachée à l'espace,
  pas à une opération : elle est partagée par toutes les opérations de l'espace. → [Mémoire](/guides/memoire)
</Info>

## Créer une opération

Une **opération** est un projet : un contenant pour des tâches, des sprints, une feuille de route, des
pages et des membres. Créez-en une depuis le bouton **Nouveau projet** (barre latérale), la tuile du
Dashboard, ou la palette `Ctrl + K`. Le formulaire s'ouvre **en place**, sans quitter votre écran.

<Steps>
  <Step title="Nom & identité visuelle">
    Donnez un **nom** à l'opération. Choisissez, si vous le souhaitez, une **icône** et une **couleur** :
    elles deviennent son identité dans toute l'application — barre latérale, tableaux, feuille de route.
  </Step>
  <Step title="Préfixe (identifiant)">
    Le **préfixe** numérote les tâches de l'opération : `WEB` donne `WEB-1`, `WEB-2`, … TaskForce le
    **dérive automatiquement** du nom (les premières lettres, en majuscules), mais vous pouvez le
    personnaliser. Court, en majuscules, il est **unique dans l'espace** — deux opérations ne partagent
    jamais le même préfixe.
  </Step>
  <Step title="Description & visibilité">
    Ajoutez une **description** (optionnelle) pour situer l'opération, puis choisissez sa **visibilité**
    — publique ou privée (voir ci-dessous). Validez : vous arrivez directement dans l'opération, prête
    à recevoir ses premières tâches.
  </Step>
</Steps>

{/* SCREENSHOT: projet-creation — la fenêtre « Créer un projet » (nom, préfixe, couleur, visibilité) */}

## Visibilité : publique ou privée

Au sein d'un espace, chaque opération a une **visibilité** qui détermine qui peut y accéder :

| Visibilité | Qui y a accès |
| --- | --- |
| **Publique** | Tous les membres de l'espace la voient et peuvent y contribuer, **selon leur rôle**. |
| **Privée** | Seuls les **collaborateurs explicitement ajoutés** y ont accès. Les autres membres ne la voient pas. |

Par défaut, une nouvelle opération est **privée** — on l'ouvre volontairement. Ensuite, ce que chacun
peut *faire* (lire seulement, écrire, administrer) dépend de son **rôle**. Les deux notions se
combinent : la visibilité dit *qui entre*, le rôle dit *ce qu'il peut faire une fois entré*.
→ [Membres & rôles](/guides/membres-et-roles)

## Ce que contient une opération

Une fois l'opération ouverte, tout ce qui lui est rattaché est accessible depuis ses onglets :

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
    Nom, préfixe, couleur, statuts et types de tâches.
  </Card>
</CardGroup>

## Adapter le flux de travail

Dans les **Paramètres** d'une opération, vous ajustez son flux à votre équipe : les **statuts** (leurs
noms, couleurs et ordre) et les **types de tâches**. Une équipe produit peut vouloir « En revue » et
« À déployer » ; une équipe support, « En attente client ». Chaque opération règle le sien.
→ Détails dans [Issues & tableaux](/guides/issues-et-tableaux)

<Tip>
  Le **préfixe** se choisit une fois et se lit ensuite des centaines de fois (`WEB-42`, `API-7`…).
  Préférez un préfixe **court et parlant** — deux à quatre lettres qui évoquent l'opération.
</Tip>
