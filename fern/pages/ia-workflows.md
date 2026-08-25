---
title: Workflows
subtitle: Des traitements agentiques que Cortex planifie et exécute pour vous.
---

Là où l'[assistant](/guides/ia-assistant) répond dans l'instant, un **workflow** est un **traitement
plus profond** : Cortex établit un **plan**, l'exécute étape par étape **en arrière-plan**, et peut
**vous consulter** avant de conclure. C'est l'outil des tâches qui demandent plusieurs étapes et un
peu de temps — pas une simple question-réponse.

On ouvre les workflows depuis le bouton **Workflows** de la barre du haut : ils vivent dans un **dock**
latéral où vous suivez chaque traitement en cours, sans quitter votre écran.

{/* SCREENSHOT: ia-workflows-dock — le dock des workflows (un job avec son plan et son statut) */}

## Le cycle de vie d'un workflow

Chaque workflow (ou *job*) affiche son **plan** et son **statut**, qui évolue au fil de l'exécution :

| Statut | Signification |
| --- | --- |
| **En file** *(Queued)* | Reçu, en attente de démarrage. |
| **En cours** *(Running)* | Cortex exécute les étapes du plan. |
| **En attente de vous** *(Waiting for input)* | Le workflow a besoin d'une **réponse** pour continuer. |
| **Terminé** *(Done)* | Le traitement est allé au bout. |
| **Échoué** *(Failed)* | Il s'est arrêté sur une erreur. |

Chaque statut a sa couleur dans le dock : d'un coup d'œil, vous voyez ce qui tourne, ce qui vous
attend, ce qui est fini.

## Le point clé : l'humain dans la boucle

Un workflow ne part pas en roue libre. Quand il passe **En attente de vous**, il **pose sa question
directement dans sa carte** : vous **répondez**, et il reprend là où il s'était arrêté. Vous gardez
donc la main sur les décisions, pendant que Cortex se charge de l'exécution.

Vous pouvez aussi **déplier** un workflow pour suivre le détail de son plan, ou l'**écarter** du dock
quand il ne vous sert plus.

<Note>
  Les workflows **consomment des tokens** pendant qu'ils tournent (planification, exécution). Leur
  progression et leur coût restent visibles. → [Vue d'ensemble de l'IA](/guides/ia-vue-ensemble)
</Note>
