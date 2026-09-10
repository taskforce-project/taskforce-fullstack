package com.taskforce.tf_api.core.service.delivery;

/**
 * Brief envoyé à un agent de livraison pour exécuter une tâche (TF-AGENT-DELIVERY slice 3).
 * Contexte minimal ; le contexte riche (Brain OS, outils) sera enrichi ensuite (cf. spec §3.5).
 *
 * @param issueId       issue déléguée
 * @param workspaceId   workspace de l'issue (pour retrouver ses secrets connectés, ex. clé Anthropic), ou null
 * @param title         titre de la tâche
 * @param description   description / spec (peut être null)
 * @param repoFullName  dépôt de code où travailler ("owner/name"), ou null
 * @param model         modèle recommandé / choisi, ou null
 */
public record AgentBrief(
    Long issueId,
    Long workspaceId,
    String title,
    String description,
    String repoFullName,
    String model
) {}
