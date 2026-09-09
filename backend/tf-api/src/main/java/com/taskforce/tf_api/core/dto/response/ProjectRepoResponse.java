package com.taskforce.tf_api.core.dto.response;

/**
 * Résultat d'un lien / délien de dépôt sur un projet (TF-AGENT-DELIVERY).
 * {@code repoProvider} et {@code repoFullName} sont null quand le dépôt est délié.
 */
public record ProjectRepoResponse(
    Long projectId,
    String repoProvider,
    String repoFullName
) {}
