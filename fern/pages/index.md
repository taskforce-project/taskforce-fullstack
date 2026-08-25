---
title: Bienvenue
subtitle: La documentation de TaskForce, l'AI Delivery OS.
---

**TaskForce** est le poste de commandement d'une équipe : ses **opérations** (projets), ses **tâches**,
ses **sprints**, sa **feuille de route** et sa **base de connaissance** au même endroit — le tout
assisté par l'IA **Cortex**. Cette documentation couvre deux usages : les **guides produit** pour
prendre en main l'application, et la **[référence API](/api)** pour l'automatiser et l'intégrer.

<CardGroup cols={2}>
  <Card title="Premiers pas" icon="rocket" href="/guides/premiers-pas">
    Du compte à votre premier projet, en quelques minutes.
  </Card>
  <Card title="Concepts clés" icon="shapes" href="/guides/concepts-cles">
    Espace, opération, tâche, sprint, mémoire : le vocabulaire.
  </Card>
  <Card title="Tour de l'interface" icon="compass" href="/guides/tour-interface">
    La barre latérale, la barre du haut, les panneaux IA.
  </Card>
  <Card title="Opérations & tâches" icon="list-check" href="/guides/issues-et-tableaux">
    Tickets, statuts, priorités, labels, vues Liste et Kanban.
  </Card>
  <Card title="L'IA — Cortex" icon="robot" href="/guides/ia-vue-ensemble">
    Assistant, workflows, génération de spec, Smart Assign.
  </Card>
  <Card title="Smart Assign" icon="wand-magic-sparkles" href="/guides/smart-assign">
    L'IA suggère la bonne personne pour chaque tâche.
  </Card>
  <Card title="Membres & rôles" icon="users" href="/guides/membres-et-roles">
    Qui peut voir, écrire, administrer — et comment inviter.
  </Card>
  <Card title="Référence API" icon="code" href="/api">
    Endpoints REST, générés depuis la spec OpenAPI.
  </Card>
</CardGroup>

## TaskForce en 30 secondes

- Une équipe travaille dans un **espace de travail**. Elle y crée des **opérations** (des projets),
  qui contiennent des **tâches** organisées en **sprints** et positionnées sur une **feuille de route**.
- Chaque membre a un **rôle** (Propriétaire, Admin, Membre, Lecteur) qui définit ses droits, et un
  **profil de compétences** qui alimente l'assignation intelligente.
- L'IA **Cortex** est tissée dans l'app : elle suggère à qui confier une tâche, répond dans un
  **assistant**, lance des **workflows** et rédige des **specs**.
- Tout ce qui vous concerne remonte dans vos **Signaux** (notifications) et votre **Ma file** (vos tâches).

<Note>
  Deux surfaces sont encore en cours de finition et signalées **Lab** dans l'app (petite fiole) :
  **Intelligence** (analytics) et **Brain OS** (la mémoire). Cette documentation les présente comme
  telles — un aperçu, pas des fonctionnalités figées.
</Note>

## Par où commencer

- **Vous découvrez TaskForce ?** Suivez les **[premiers pas](/guides/premiers-pas)**, puis lisez les
  **[concepts clés](/guides/concepts-cles)** et faites le **[tour de l'interface](/guides/tour-interface)**.
- **Vous rejoignez une équipe ?** Voir **[inviter son équipe](/guides/inviter-son-equipe)** et
  **[membres & rôles](/guides/membres-et-roles)**.
- **Vous automatisez ?** La **[référence API](/api)** liste tous les endpoints REST.
