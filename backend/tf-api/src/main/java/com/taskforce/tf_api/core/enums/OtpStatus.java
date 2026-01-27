package com.taskforce.tf_api.core.enums;

/**
 * Statut d'un code OTP
 */
public enum OtpStatus {
    /**
     * Le code OTP a été généré et envoyé, en attente de validation
     */
    PENDING,

    /**
     * Le code OTP a été vérifié avec succès
     */
    VERIFIED,

    /**
     * Le code OTP a expiré (au-delà de la durée de validité)
     */
    EXPIRED,

    /**
     * Le code OTP a déjà été utilisé (ne peut être réutilisé)
     */
    USED
}
