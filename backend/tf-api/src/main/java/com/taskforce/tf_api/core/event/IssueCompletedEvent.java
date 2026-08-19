package com.taskforce.tf_api.core.event;

/**
 * Une issue vient de passer dans un statut de catégorie {@code COMPLETED} — transition réelle,
 * publiée une seule fois (garde {@code completedAt == null} côté {@code IssueService}).
 *
 * <p>Ne transporte que des identifiants (cf. {@link CycleCompletedEvent}).
 */
public record IssueCompletedEvent(
    String workspaceSlug,
    Long workspaceId,
    Long projectId,
    Long issueId,
    Long userId
) {}
