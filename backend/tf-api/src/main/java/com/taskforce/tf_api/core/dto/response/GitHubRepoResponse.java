package com.taskforce.tf_api.core.dto.response;

/**
 * Dépôt GitHub accessible via le token connecté (PROD-5.1 — sync read).
 */
public record GitHubRepoResponse(
    String fullName,
    String name,
    boolean isPrivate,
    String htmlUrl,
    int openIssues
) {}
