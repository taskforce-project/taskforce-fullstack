package com.taskforce.tf_api.core.enums;

/**
 * Rôle d'un membre dans un workspace
 */
public enum WorkspaceRole {
    /** Créateur du workspace — droits complets */
    OWNER,
    /** Peut gérer les membres et les paramètres */
    ADMIN,
    /** Accès standard */
    MEMBER
}
