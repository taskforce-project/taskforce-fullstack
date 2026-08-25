---
title: Mémoire (Brain OS)
subtitle: La base de connaissance de l'espace, structurée en graphe.
---

<Warning>
  Le **Brain OS** est une fonctionnalité **Lab** — en cours de finition (signalée par une fiole dans la
  barre latérale). Les grandes lignes ci-dessous décrivent ce qui existe ; certains aspects évoluent
  encore.
</Warning>

Chaque espace de travail dispose d'une **mémoire** : le **Brain OS**. C'est une base de connaissance
organisée en **graphe** — des **nœuds** de savoir, reliés entre eux — pensée pour être exploitée par
l'IA. L'idée : à côté des tâches qui *exécutent* et des pages qui *décrivent*, un endroit qui **relie**
la connaissance de l'équipe.

## Des nœuds de connaissance typés

Un **nœud** porte un **type** et un **domaine**. Les types couvrent les objets de savoir d'une équipe :
décision (ADR), runbook, procédure, spécification, note, document, template… Les domaines les rangent
(Produit, Architecture, Engineering, API, Sécurité, Opérations…).

Chaque nœud a un **contenu en markdown** que vous éditez sur place. Vous pouvez aussi **importer des
fichiers** pour alimenter la mémoire.

## Un graphe, pas une simple liste

Les nœuds se **relient** par des arêtes : c'est ce qui fait un *graphe de connaissance* plutôt qu'un
dossier de documents. Une **visualisation** permet de parcourir ces liens, et une **recherche** de
retrouver un nœud par son contenu.

{/* SCREENSHOT: brain-graph — la vue graphe du Brain OS (nœuds reliés) — marquée Lab */}

## Mémoire, Pages : quelle différence ?

- Les **[Pages](/guides/pages)** sont des documents *d'une opération*, écrits à la main pour l'équipe.
- La **mémoire** est *de l'espace*, structurée en graphe et **destinée à l'IA** — un socle que Cortex
  peut relier et exploiter.

<Note>
  Un espace = une mémoire. L'alimentation de la mémoire par l'IA est **métrée en tokens** (comme les
  autres fonctions Cortex). → [Vue d'ensemble de l'IA](/guides/ia-vue-ensemble)
</Note>
