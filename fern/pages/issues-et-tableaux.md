---
title: Issues & tableaux
subtitle: Créer, qualifier et suivre les tâches d'une opération.
---

Une **tâche** est une unité de travail — une fonctionnalité, un bug, une story. Elle vit dans une
opération et porte un identifiant unique (ex. `WEB-42`, du préfixe de l'opération).

## Créer une tâche

Ouvrez une opération, puis créez une tâche depuis le bouton **+** d'un tableau ou d'une colonne. Au
minimum, un **titre** suffit ; tout le reste peut être renseigné plus tard, directement sur la tâche.

{/* SCREENSHOT: tache-detail — le panneau de détail d'une tâche (propriétés à droite, activité) */}

## Les propriétés d'une tâche

| Propriété | À quoi ça sert |
| --- | --- |
| **Statut** | Où en est la tâche (À faire, En cours, Terminé…). Personnalisable par opération. |
| **Priorité** | Aucune, Basse, Moyenne, Haute, **Urgente**. |
| **Type** | Nature de la tâche (Fonctionnalité, Bug, Story…). Personnalisable par opération. |
| **Responsable** | La personne qui la prend en charge. Voir [assignation](/guides/assignations). |
| **Labels** | Des étiquettes libres et colorées pour filtrer et regrouper. |
| **Dates** | Date de **début** et **d'échéance**. |
| **Story points** | L'estimation d'effort (chiffrée). |
| **Sous-tâches** | Une tâche peut avoir une tâche **parente** et des enfants. |
| **Relations** | Liens entre tâches : *bloque*, *bloquée par*, *doublon*, *liée à*. |
| **Commentaires** | La discussion attachée à la tâche. |
| **Activité** | Le journal horodaté de tout ce qui change sur la tâche. |

## Statuts & types personnalisables

Chaque opération définit **ses propres statuts** et **ses propres types de tâches**, dans ses
**Paramètres**. Un statut appartient à l'une de cinq **catégories** qui structurent le flux :

`Backlog` → `À planifier` → `En cours` → `Terminé` → `Annulé`

Cette catégorie détermine, par exemple, quand une tâche est considérée comme *achevée* dans les
statistiques et les sprints. Les couleurs et les libellés, eux, sont à vous.

## Sous-tâches & relations

Une tâche complexe se **découpe en sous-tâches** (relation parent → enfants), et deux tâches
peuvent être **reliées** :

- **Bloque / Bloquée par** — une dépendance d'ordre (l'une doit précéder l'autre).
- **Doublon** — signale un doublon.
- **Liée à** — un lien simple, sans contrainte.

## Les vues d'un tableau

TaskForce présente les tâches d'une opération de trois façons, au choix :

<CardGroup cols={3}>
  <Card title="Liste" icon="list">
    Une liste dense, triable et filtrable — idéale pour balayer et éditer vite.
  </Card>
  <Card title="Kanban" icon="table-columns">
    Des colonnes par statut ; on fait glisser une tâche d'une colonne à l'autre.
  </Card>
  <Card title="Backlog" icon="layer-group">
    Le réservoir des tâches non planifiées, à trier et à affecter aux sprints.
  </Card>
</CardGroup>

{/* SCREENSHOT: tache-kanban — la vue Kanban d'une opération (colonnes par statut, tâches) */}

## Suivre et organiser

- **Commentaires & activité** — chaque tâche a son fil de discussion et son **journal d'activité**
  (changement de statut, de responsable, de priorité… tout est horodaté).
- **Épingler** — remonte une tâche en tête du tableau.
- **Archiver** — la retire des vues par défaut sans la supprimer.

<Tip>
  Vous cherchez à confier une tâche à la bonne personne sans y réfléchir ? Laissez **Smart Assign**
  vous suggérer un responsable selon les compétences et la charge. → [Smart Assign](/guides/smart-assign)
</Tip>
