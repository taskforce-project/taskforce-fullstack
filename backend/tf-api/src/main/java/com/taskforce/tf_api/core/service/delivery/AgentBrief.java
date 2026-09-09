package com.taskforce.tf_api.core.service.delivery;

/**
 * Brief envoyé à un agent de livraison pour exécuter une tâche (TF-AGENT-DELIVERY slice 3).
 * Contexte minimal ; le contexte riche (Brain OS, outils) sera enrichi ensuite (cf. spec §3.5).
 *
 * @param issueId       issue déléguée
 * @param title         titre de la tâche
 * @param description   description / spec (peut être null)
 * @param repoFullName  dépôt de code où travailler ("owner/name"), ou null
 * @param model         modèle recommandé / choisi, ou null
 */
public record AgentBrief(
    Long issueId,
    String title,
    String description,
    String repoFullName,
    String model
) {}
