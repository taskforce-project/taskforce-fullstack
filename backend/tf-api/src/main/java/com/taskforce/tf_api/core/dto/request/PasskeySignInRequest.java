package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Connexion par passkey : la réponse du navigateur ({@code navigator.credentials.get}) au défi {@code requestId}.
 *
 * @param requestId  défi rendu par {@code POST /api/auth/passkey/options}
 * @param credential la réponse du navigateur, au format JSON de WebAuthn
 */
public record PasskeySignInRequest(
    @NotBlank @Size(max = 64)
    String requestId,

    @NotNull
    Map<String, Object> credential
) {}
