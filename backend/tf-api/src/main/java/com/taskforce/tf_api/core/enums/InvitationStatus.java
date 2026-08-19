package com.taskforce.tf_api.core.enums;

/**
 * Cycle de vie d'une invitation workspace par email (PROD-3.5).
 */
public enum InvitationStatus {
    /** En attente d'acceptation. */
    PENDING,
    /** Acceptée — l'invité est devenu membre. */
    ACCEPTED,
    /** Annulée par un admin/owner. */
    REVOKED,
    /** Expirée (date dépassée). */
    EXPIRED
}
