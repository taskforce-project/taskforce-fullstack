package com.taskforce.tf_api.core.dto.response;

/**
 * Issue ou PR d'un dépôt GitHub (PROD-5.1 — sync read). {@code pullRequest=true} = c'est une PR.
 */
public record GitHubIssueResponse(
    int number,
    String title,
    String state,
    String htmlUrl,
    boolean pullRequest,
    String author,
    String updatedAt
) {}
