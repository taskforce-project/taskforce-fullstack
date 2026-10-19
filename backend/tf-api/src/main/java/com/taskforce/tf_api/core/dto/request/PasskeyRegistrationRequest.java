package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Passkey créée par le navigateur ({@code navigator.credentials.create}), à enregistrer sur le compte.
 *
 * @param label      nom de la passkey dans la liste (« Windows Hello ») ; facultatif
 * @param credential la réponse du navigateur, au format JSON de WebAuthn (identifiants et octets en base64url)
 */
public record PasskeyRegistrationRequest(
    @Size(max = 80)
    String label,

    @NotNull
    Map<String, Object> credential
) {}
