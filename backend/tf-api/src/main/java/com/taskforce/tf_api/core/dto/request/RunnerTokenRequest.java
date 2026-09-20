package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Identifiants machine d'un runner local (ADR-013) : le client Keycloak et son secret.
 */
public record RunnerTokenRequest(
    @NotBlank @Size(max = 100) String clientId,
    @NotBlank @Size(max = 200) String clientSecret
) {}
