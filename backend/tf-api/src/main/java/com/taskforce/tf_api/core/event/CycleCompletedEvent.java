package com.taskforce.tf_api.core.event;

/**
 * Un cycle vient de passer en {@code COMPLETED} — transition réelle, publiée une seule fois
 * (garde {@code previousStatus != COMPLETED} côté {@code CycleService}).
 *
 * <p>Ne transporte que des identifiants : le consommateur tourne après commit, sur un autre
 * thread et hors transaction — une entité y serait un proxy détaché (lazy loading impossible).
 */
public record CycleCompletedEvent(
    String workspaceSlug,
    Long workspaceId,
    Long projectId,
    Long cycleId,
    Long userId
) {}
