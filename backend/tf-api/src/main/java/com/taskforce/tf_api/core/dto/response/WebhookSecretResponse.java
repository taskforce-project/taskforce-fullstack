package com.taskforce.tf_api.core.dto.response;

/** Nouveau secret de signature d'un webhook : montré cette seule fois. L'ancien cesse aussitôt de signer. */
public record WebhookSecretResponse(String secret) {}
