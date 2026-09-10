package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * Connexion de la clé API Anthropic d'un workspace (délégation Claude via l'API, TF-AGENT-DELIVERY B1).
 * La clé est stockée chiffrée ({@code Integration.accessToken}) et jamais renvoyée en clair.
 */
public record ConnectAnthropicRequest(
    @NotBlank(message = "La clé API Anthropic est obligatoire") String apiKey
) {}
