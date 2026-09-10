package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * Connexion d'une clé API de délégation d'un workspace (Anthropic, Cursor... TF-AGENT-DELIVERY).
 * La clé est stockée chiffrée ({@code Integration.accessToken}) et jamais renvoyée en clair.
 */
public record ConnectKeyRequest(
    @NotBlank(message = "La clé API est obligatoire") String apiKey
) {}
