package com.taskforce.tf_api.core.dto.response;

/**
 * État de la connexion d'une clé de délégation d'un workspace (Anthropic, Cursor... TF-AGENT-DELIVERY).
 *
 * @param connected la clé est présente (délégation possible vers ce provider)
 * @param keyHint   indice non sensible pour reconnaître la clé (4 derniers caractères, ex. "...AB12"), ou null
 */
public record DeliveryKeyStatus(boolean connected, String keyHint) {}
