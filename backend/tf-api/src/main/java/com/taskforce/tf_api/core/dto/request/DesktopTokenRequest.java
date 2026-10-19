package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Échange, par l'app desktop, du code d'autorisation reçu sur 127.0.0.1 contre une session.
 *
 * @param code         code d'autorisation (deux minutes, un seul usage)
 * @param codeVerifier vérificateur PKCE du défi envoyé à la page de connexion
 * @param redirectUri  adresse de retour utilisée pour ce code
 * @param deviceName   l'ordinateur, tel que l'app le décrit (« Windows ») ; facultatif
 */
public record DesktopTokenRequest(
    @NotBlank @Size(max = 64)
    String code,

    @NotBlank @Size(max = 128)
    String codeVerifier,

    @NotBlank @Size(max = 64)
    String redirectUri,

    @Size(max = 80)
    String deviceName
) {}
