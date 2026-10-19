package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Accord donné dans la webapp à l'app desktop qui a ouvert la page de connexion (page {@code /auth/desktop}).
 *
 * @param codeChallenge défi PKCE (S256) tiré par l'app
 * @param redirectUri   adresse de retour de l'app, sur 127.0.0.1
 * @param state         valeur opaque de l'app, rendue telle quelle
 */
public record DesktopAuthorizeRequest(
    @NotBlank @Size(max = 64)
    String codeChallenge,

    @NotBlank @Size(max = 64)
    String redirectUri,

    @NotBlank @Size(max = 128)
    String state
) {}
