---
title: Concepts clés
subtitle: Le vocabulaire de TaskForce, en une page.
---

TaskForce s'organise autour de quelques objets simples. Cette page les définit ; chaque concept a
ensuite son guide dédié.

## La hiérarchie

```
Espace de travail
└── Opération  (un projet — préfixe de tâche, ex. WEB)
    ├── Tâche          (WEB-1, WEB-2, …)
    ├── Sprint         (regroupe des tâches sur une période)
    ├── Feuille de route (jalons de l'opération)
    └── Page           (document rattaché à l'opération)
```

## Le vocabulaire de TaskForce

L'interface emploie un vocabulaire « poste de commandement ». Voici la correspondance avec les termes
habituels de gestion de projet — utile si vous venez d'un autre outil.

| Dans TaskForce | Autrement dit | Guide |
| --- | --- | --- |
| **Opération** | Projet | [Espaces & projets](/guides/espaces-et-projets) |
| **Tâche** | Issue / ticket | [Issues & tableaux](/guides/issues-et-tableaux) |
| **Sprint** | Cycle / itération | [Cycles](/guides/cycles) |
| **Feuille de route** | Roadmap | [Roadmap](/guides/roadmap) |
| **Page** | Doc / page de projet | [Pages](/guides/pages) |
| **Signaux** | Boîte de réception / notifications | [Boîte de réception](/guides/inbox) |
| **Ma file** | Mon travail (mes tâches) | [Mon travail](/guides/mon-travail) |
| **Intelligence** | Analytics | [Analytics](/guides/analytics) |
| **Brain OS** | Mémoire / base de connaissance | [Mémoire](/guides/memoire) |
| **Cortex** | L'assistant IA | [Vue d'ensemble de l'IA](/guides/ia-vue-ensemble) |

## Espace de travail

Un **espace de travail** (workspace) regroupe une équipe, ses opérations et sa base de connaissance.
Vous disposez d'un **espace personnel** (créé à l'inscription) et pouvez être membre d'**espaces
partagés**. → [Espaces & projets](/guides/espaces-et-projets)

## Opération

Une **opération** est un **projet** : elle regroupe des tâches, des membres et des labels à l'intérieur
d'un espace. Son **nom est libre**, mais son **préfixe** (ex. `WEB`) est **unique dans l'espace** et
numérote les tâches. Une opération est **publique** (visible des membres de l'espace) ou **privée**
(membres explicites).

## Tâche

Une **tâche** est une unité de travail (fonctionnalité, bug, story). Elle porte un **statut**, une
**priorité**, un **type**, des **labels**, un **responsable**, des **commentaires** et un fil
d'**activité**. → [Issues & tableaux](/guides/issues-et-tableaux)

## Tableau / vue

Un **tableau** affiche les tâches d'une opération. TaskForce propose les vues **Liste**, **Kanban**
(par statut) et **Backlog**.

## Sprint

Un **sprint** regroupe des tâches sur une **période bornée** (début / fin) et suit leur avancement.
→ [Cycles](/guides/cycles)

## Feuille de route

La **feuille de route** positionne les jalons d'une opération dans le temps, pour la vue d'ensemble.
→ [Roadmap](/guides/roadmap)

## Page

Une **page** est un document (spécification, compte rendu, note) rattaché à une opération.
→ [Pages](/guides/pages)

## Membre & rôle

Chaque personne d'un espace a un **rôle** (Propriétaire, Admin, Membre, Lecteur) qui détermine ses
droits. → [Membres & rôles](/guides/membres-et-roles)

## Cortex & Brain OS

**Cortex** est l'assistant IA de TaskForce : il assiste l'assignation, répond dans un chat, exécute des
workflows et rédige des specs. → [Vue d'ensemble de l'IA](/guides/ia-vue-ensemble)

Chaque espace dispose aussi d'une **mémoire** — le **Brain OS** — une base de connaissance liée à vos
opérations, pensée pour être exploitée par l'IA. → [Mémoire](/guides/memoire)
