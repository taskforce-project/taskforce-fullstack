package com.taskforce.tf_api.core.event;

/**
 * Un projet vient d'etre cree. Alimente le Brain OS (fiche de contexte du projet) via
 * {@code BrainIngestionListener}, apres commit.
 *
 * <p>Ne transporte que des identifiants : le consommateur tourne apres commit, sur un autre
 * thread et hors transaction - une entite y serait un proxy detache (lazy loading impossible).
 */
public record ProjectCreatedEvent(
    String workspaceSlug,
    Long workspaceId,
    Long projectId,
    Long userId
) {}
