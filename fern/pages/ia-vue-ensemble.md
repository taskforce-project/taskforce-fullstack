---
title: Vue d'ensemble de l'IA
subtitle: Cortex — l'assistant tissé dans toute l'application.
---

**Cortex** est l'intelligence de TaskForce. Ce n'est pas un module à part : c'est une couche présente
**là où vous travaillez** — pour vous répondre, préparer une tâche, suggérer qui l'assigner, exécuter
un traitement, ou lire vos données.

## Où Cortex intervient

<CardGroup cols={2}>
  <Card title="Assistant" icon="comments" href="/guides/ia-assistant">
    Un chat qui répond dans un panneau, sans quitter votre écran.
  </Card>
  <Card title="Workflows" icon="diagram-project" href="/guides/ia-workflows">
    Des traitements agentiques : Cortex planifie, exécute, vous consulte au besoin.
  </Card>
  <Card title="Génération de spec" icon="file-pen" href="/guides/ia-generation-spec">
    Cortex rédige le brouillon d'une tâche ; vous validez.
  </Card>
  <Card title="Smart Assign" icon="wand-magic-sparkles" href="/guides/smart-assign">
    La bonne personne suggérée selon les compétences et la charge.
  </Card>
  <Card title="Intelligence" icon="chart-line" href="/guides/analytics">
    Graphes et analyses générés à la demande. **Lab**.
  </Card>
  <Card title="Mémoire (Brain OS)" icon="brain" href="/guides/memoire">
    La connaissance de l'espace, reliée pour l'IA. **Lab**.
  </Card>
</CardGroup>

## Ce que ça consomme

L'IA est **incluse dans toutes les offres** — elle n'est pas réservée à un forfait supérieur. Son
usage se mesure en **tokens** : chaque sollicitation de Cortex consomme une part de votre enveloppe.
Vous suivez cette consommation dans l'application (carte **Usage Cortex** du Dashboard, indicateur
dans le panneau IA), et les **offres supérieures relèvent le plafond** pour passer à l'échelle.

→ [Offres, facturation & IA](/guides/offres-et-ia)

<Tip>
  Certaines aides sont **offertes** et n'entament pas votre enveloppe — par exemple la **suggestion de
  compétences** pendant l'[onboarding](/guides/onboarding-et-profil).
</Tip>

<Note>
  Cortex s'appuie sur un modèle de langage côté serveur. Plusieurs fonctions prévoient un **repli
  déterministe** : si l'IA n'est pas disponible, la fonctionnalité reste utilisable (avec un résultat
  plus simple) plutôt que de vous bloquer.
</Note>
