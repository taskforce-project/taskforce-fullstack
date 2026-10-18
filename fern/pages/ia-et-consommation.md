---
title: IA et consommation
subtitle: Ce que consomme Cortex, et comment une instance en fixe la limite.
---

## L'IA est incluse

**Cortex est disponible pour tout le monde**, sur toutes les fonctionnalités : il n'y a ni forfait ni
option à débloquer. TaskForce est libre (AGPL-3.0) et l'IA tourne sur le fournisseur choisi par votre
instance : un modèle local (Ollama) ou une API compatible OpenAI.

## Ce que ça consomme

Chaque sollicitation de Cortex consomme des **tokens**. Vous suivez cette consommation dans
**Paramètres → Usage Cortex**, sur la carte **Usage Cortex** du Dashboard et dans le panneau IA.
→ [Vue d'ensemble de l'IA](/guides/ia-vue-ensemble)

## La limite de votre instance

Par défaut, **aucune limite** : avec un modèle local, Cortex ne coûte que la puissance de calcul de la
machine. Une instance adossée à une API payante peut poser deux garde-fous, réglés par son
administrateur :

| Variable | Effet |
| --- | --- |
| `AI_MONTHLY_TOKENS_PER_ACCOUNT` | Plafond mensuel de tokens par compte. `0` = illimité. |
| `AI_RATE_GLOBAL_TPM`, `AI_RATE_ACCOUNT_TPM`, `AI_RATE_ACCOUNT_RPM` | Débit par minute : tokens pour toute l'instance, tokens et requêtes par compte. `0` = désactivé. |

Quand le plafond mensuel est atteint, Cortex le signale dans la conversation. Le compteur repart le
premier jour du mois suivant, et l'administrateur peut relever la limite.

<Tip>
  Vous cherchez à ajouter des personnes à l'espace ? Il suffit de les inviter, sans limite de nombre.
  → [Inviter son équipe](/guides/inviter-son-equipe)
</Tip>
