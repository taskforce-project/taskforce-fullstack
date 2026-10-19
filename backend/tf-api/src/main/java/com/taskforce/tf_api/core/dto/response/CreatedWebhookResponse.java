package com.taskforce.tf_api.core.dto.response;

/** Webhook créé, avec son secret de signature : montré cette seule fois, jamais relu ensuite. */
public record CreatedWebhookResponse(WebhookResponse webhook, String secret) {}
