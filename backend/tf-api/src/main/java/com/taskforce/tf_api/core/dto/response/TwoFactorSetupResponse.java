package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Renvoyé au démarrage de l'activation 2FA : de quoi afficher le QR (ou saisir à la main) dans une
 * app d'authentification. Le 2FA n'est PAS encore actif à ce stade — il le devient après confirmation
 * d'un premier code.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TwoFactorSetupResponse {

    /** Secret Base32 (saisie manuelle de secours). */
    private String secret;

    /** URI `otpauth://totp/…` à encoder en QR côté client. */
    private String otpauthUri;
}
