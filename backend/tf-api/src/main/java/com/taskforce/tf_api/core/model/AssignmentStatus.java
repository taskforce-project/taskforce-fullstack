package com.taskforce.tf_api.core.model;

/**
 * Statut d'acceptation de l'assignation courante d'une issue.
 * {@code null} (non stocké ici) = pas d'assigné, ou assignation historique (avant la feature).
 */
public enum AssignmentStatus {
    /** Assignée par un tiers, en attente de validation de l'assigné. */
    PENDING,
    /** Acceptée (ou auto-acceptée sur self-assign). */
    ACCEPTED,
}
