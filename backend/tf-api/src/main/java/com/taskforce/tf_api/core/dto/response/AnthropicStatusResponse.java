package com.taskforce.tf_api.core.dto.response;

/**
 * État de la connexion de la clé API Anthropic d'un workspace (délégation Claude, TF-AGENT-DELIVERY B1).
 *
 * @param connected la clé est présente (délégation Claude possible)
 * @param keyHint   indice non sensible pour reconnaître la clé (4 derniers caractères, ex. "...AB12"), ou null
 */
public record AnthropicStatusResponse(boolean connected, String keyHint) {}
