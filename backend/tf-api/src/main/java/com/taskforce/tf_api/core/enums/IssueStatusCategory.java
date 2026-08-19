package com.taskforce.tf_api.core.enums;

/**
 * Catégorie logique d'un statut d'issue.
 * Utilisée en interne pour les filtres et stats — jamais affichée directement.
 * Le nom visible est issue_statuses.name (configurable par projet).
 */
public enum IssueStatusCategory {
    /** Issues non planifiées, en attente */
    BACKLOG,
    /** Planifiées mais pas démarrées */
    UNSTARTED,
    /** En cours de traitement */
    STARTED,
    /** Terminées avec succès */
    COMPLETED,
    /** Abandonnées */
    CANCELLED
}
