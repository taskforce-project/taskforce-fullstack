---
title: Smart Assign
subtitle: La bonne personne pour chaque tâche — suggérée, jamais imposée.
---

**Smart Assign** répond à une question simple : *« qui devrait prendre cette tâche ? »*. Cortex évalue
les membres de l'opération et vous propose **la personne la plus adaptée**, avec des alternatives. Vous
restez décideur — c'est une **suggestion**.

## Ce que Cortex évalue

La recommandation croise plusieurs signaux, pour chaque personne :

| Critère | Ce qu'il regarde |
| --- | --- |
| **Compétences** | La correspondance entre les tags de compétences de la personne et la tâche. |
| **Expérience** | Son historique sur des tâches semblables. |
| **Charge de travail** | Ce qu'elle a déjà en cours. |
| **Disponibilité** | Sa capacité déclarée (heures/semaine). |

Ces signaux se combinent en un **score**, et Cortex renvoie **un·e recommandé·e** en tête, suivi·e
d'**alternatives** classées — libre à vous de choisir.

{/* SCREENSHOT: smart-assign — la suggestion Smart Assign (recommandé + alternatives, scores) */}

## Où l'utiliser

- **À la création d'une tâche** — une suggestion vous est proposée avant même de l'enregistrer.
- **En lot** — demandez des recommandations pour **plusieurs tâches à la fois** (multi-assign).
- **Après un refus** — quand une assignation est refusée, Smart Assign aide à trouver le prochain bon
  choix. → [Accepter ou refuser une assignation](/guides/assignations)

## D'où viennent les données

Smart Assign s'appuie sur les **profils de compétences** des membres — renseignés à
l'[onboarding](/guides/onboarding-et-profil) et modifiables dans le profil. Plus les profils sont à
jour, meilleures sont les suggestions.

<Note>
  Si l'IA n'est pas disponible, Smart Assign bascule sur un **classement déterministe** (repli) plutôt
  que de ne rien proposer. La suggestion **consomme des tokens** lorsqu'elle passe par le modèle.
</Note>
