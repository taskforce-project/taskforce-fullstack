---
title: Workflows
subtitle: Des traitements agentiques que Cortex planifie et exécute pour vous.
---

Là où l'[assistant](/guides/ia-assistant) répond dans l'instant, un **workflow** est un **traitement
plus profond** : Cortex établit un **plan**, l'exécute étape par étape en arrière-plan, et peut **vous
consulter en cours de route** avant de conclure.

On ouvre les workflows depuis le bouton **Workflows** de la barre du haut : ils vivent dans un **dock**
latéral où vous suivez chaque traitement.

{/* SCREENSHOT: ia-workflows-dock — le dock des workflows (un job avec son plan et son statut) */}

## Le cycle de vie d'un workflow

Chaque workflow (ou *job*) affiche son **plan** et son **statut** :

| Statut | Signification |
| --- | --- |
| **En file** *(Queued)* | En attente de démarrage. |
| **En cours** *(Running)* | Cortex exécute les étapes. |
| **En attente de vous** *(Waiting for input)* | Le workflow a besoin d'une **réponse** pour continuer. |
| **Terminé** *(Done)* | Le traitement est allé au bout. |
| **Échoué** *(Failed)* | Le traitement s'est arrêté sur une erreur. |

## Le point clé : l'humain dans la boucle

Quand un workflow passe **En attente de vous**, il vous pose une question directement dans sa carte :
vous **répondez**, et il reprend. Vous pouvez aussi **déplier** un workflow pour suivre son plan, ou
l'**écarter** du dock.

<Note>
  Les workflows **consomment des tokens** pendant qu'ils tournent (planification, exécution). Leur
  progression et leur coût restent visibles. → [Vue d'ensemble de l'IA](/guides/ia-vue-ensemble)
</Note>
