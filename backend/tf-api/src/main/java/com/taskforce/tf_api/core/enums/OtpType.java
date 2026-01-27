package com.taskforce.tf_api.core.enums;

/**
 * Type de code OTP (One-Time Password)
 */
public enum OtpType {
    /**
     * Code OTP pour vérifier l'adresse email lors de l'inscription
     */
    EMAIL_VERIFICATION,

    /**
     * Code OTP pour réinitialiser le mot de passe
     */
    PASSWORD_RESET,

    /**
     * Code OTP pour l'authentification à deux facteurs (2FA)
     */
    TWO_FACTOR_AUTH
}
