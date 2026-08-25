---
title: Issues & tableaux
subtitle: Créer, qualifier et suivre les tâches d'une opération.
---

Une **tâche** est l'unité de travail de TaskForce — une fonctionnalité, un bug, une story, une action.
Elle vit dans une opération et porte un **identifiant unique et lisible** (ex. `WEB-42`), construit à
partir du préfixe de l'opération et d'un numéro incrémental. Cet identifiant la suit partout : dans les
tableaux, les recherches, les commentaires et les liens entre tâches.

## Créer une tâche

Ouvrez une opération, puis créez une tâche depuis le bouton **+** d'un tableau ou en tête d'une colonne
Kanban. Le réflexe à retenir : **un titre suffit** pour créer. Tout le reste — statut, priorité,
responsable, dates… — se renseigne ensuite directement sur la tâche, au fil de l'eau. Inutile de tout
remplir d'emblée : une tâche se qualifie progressivement.

{/* SCREENSHOT: tache-detail — le panneau de détail d'une tâche (propriétés à droite, activité) */}

## Les propriétés d'une tâche

| Propriété | À quoi ça sert |
| --- | --- |
| **Statut** | Où en est la tâche. Personnalisable par opération (voir plus bas). |
| **Priorité** | Son degré d'urgence : Aucune, Basse, Moyenne, Haute, **Urgente**. |
| **Type** | Sa nature (Fonctionnalité, Bug, Story…). Personnalisable par opération. |
| **Responsable** | La personne en charge. L'assignation se **valide** — voir [Assignations](/guides/assignations). |
| **Labels** | Des étiquettes libres et colorées, pour filtrer et regrouper transversalement. |
| **Dates** | Une date de **début** et une **d'échéance** — ce qui place la tâche sur la [feuille de route](/guides/roadmap). |
| **Story points** | Une estimation d'effort chiffrée, pour mesurer la charge et la vélocité. |
| **Sous-tâches** | Une tâche **parente** et ses enfants, pour découper le travail. |
| **Relations** | Des liens vers d'autres tâches (bloque, bloquée par, doublon, liée). |
| **Commentaires** | La discussion attachée à la tâche. |
| **Activité** | Le journal horodaté de tout ce qui change (voir plus bas). |

### Priorités

Cinq niveaux, du plus neutre au plus pressant : **Aucune**, **Basse**, **Moyenne**, **Haute**,
**Urgente**. La priorité sert à trier un tableau et à faire remonter ce qui compte — une tâche
*Urgente* doit sauter aux yeux, pas se noyer dans la liste.

## Statuts & catégories

Chaque opération définit **ses propres statuts** dans ses **Paramètres** : leurs noms, leurs couleurs,
leur ordre. Mais tout statut appartient à l'une de **cinq catégories** qui structurent le flux et
donnent leur sens aux statistiques :

| Catégorie | Ce qu'elle regroupe |
| --- | --- |
| **Backlog** | Le réservoir : idées et tâches pas encore planifiées. |
| **À planifier** *(unstarted)* | Prêtes à démarrer, mais pas encore commencées. |
| **En cours** *(started)* | Le travail actif. |
| **Terminé** *(completed)* | Ce qui est livré — compte comme *achevé* dans la vélocité et les sprints. |
| **Annulé** *(cancelled)* | Abandonné, sans être « fait ». |

Vous nommez « En revue », « À déployer » ou « Bloqué » comme vous voulez ; c'est la **catégorie** qui
dit à TaskForce si la tâche est achevée, en cours ou en attente.

## Types de tâches

Comme les statuts, les **types** sont propres à chaque opération (nom, couleur, icône) : *Bug*,
*Fonctionnalité*, *Story*, *Dette technique*… Ils permettent de qualifier la nature du travail et de
filtrer un tableau par type.

## Sous-tâches & relations

Une tâche complexe se **découpe en sous-tâches** (une tâche parente, des enfants), pour suivre un gros
chantier morceau par morceau. Et deux tâches peuvent être **reliées** :

| Relation | Sens |
| --- | --- |
| **Bloque** | Cette tâche empêche l'autre d'avancer. |
| **Bloquée par** | L'inverse : elle attend qu'une autre soit faite. |
| **Doublon** | Elle fait double emploi avec une autre. |
| **Liée à** | Un simple rapprochement, sans contrainte d'ordre. |

Les relations *Bloque / Bloquée par* sont particulièrement utiles pour rendre visibles les
**dépendances** avant qu'elles ne coincent un sprint.

## Les vues d'un tableau

Les tâches d'une opération se consultent de trois façons complémentaires :

<CardGroup cols={3}>
  <Card title="Liste" icon="list">
    Dense, triable et filtrable. Idéale pour balayer, éditer vite, traiter en série.
  </Card>
  <Card title="Kanban" icon="table-columns">
    Des colonnes par statut ; on fait glisser une tâche de colonne en colonne pour la faire avancer.
  </Card>
  <Card title="Backlog" icon="layer-group">
    Le réservoir des tâches non planifiées, à trier, prioriser et affecter aux sprints.
  </Card>
</CardGroup>

{/* SCREENSHOT: tache-kanban — la vue Kanban d'une opération (colonnes par statut, tâches) */}

## Suivre : commentaires & activité

Chaque tâche a son **fil de commentaires** — la discussion de l'équipe, au bon endroit — et surtout son
**journal d'activité** : un historique **horodaté et automatique** de tout ce qui la touche. Y sont
tracés, entre autres, la **création**, les changements de **statut**, de **priorité**, de
**responsable**, de **type**, de **titre** ou de **description**, l'ajout ou le retrait d'un **label**,
la modification des **dates**, le rattachement à une **tâche parente**, l'ajout d'un **commentaire**,
la **clôture** et la **réouverture**.

Résultat : on peut toujours répondre à *« qui a changé quoi, et quand ? »* sans reconstituer l'histoire
de mémoire.

## Organiser un tableau

- **Épingler** — remonte une tâche en tête du tableau, pour la garder sous les yeux.
- **Archiver** — la retire des vues par défaut sans la supprimer : l'historique reste, le tableau reste propre.

<Tip>
  Vous hésitez sur le bon responsable ? Laissez **Smart Assign** vous suggérer une personne selon les
  compétences et la charge, plutôt que d'y réfléchir tâche par tâche. → [Smart Assign](/guides/smart-assign)
</Tip>
