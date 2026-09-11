package com.taskforce.tf_api.core.event;

/**
 * Le contexte metier d'un espace de travail (« activite ») vient d'etre renseigne ou modifie
 * (onboarding ou creation). Alimente une fiche de contexte dans le Brain OS via
 * {@code BrainIngestionListener}, apres commit.
 *
 * <p>Ne transporte que des identifiants : le consommateur tourne apres commit, sur un autre
 * thread et hors transaction (il relit l'activite depuis la base).
 */
public record WorkspaceContextEvent(
    String workspaceSlug,
    Long workspaceId,
    Long userId
) {}
