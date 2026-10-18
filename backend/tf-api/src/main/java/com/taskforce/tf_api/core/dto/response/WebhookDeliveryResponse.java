package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * Un envoi de webhook, pour l'historique de l'écran des webhooks. {@code status} : {@code PENDING} (tentative à
 * venir le {@code nextAttemptAt}), {@code DELIVERED} ou {@code FAILED}. {@code lastStatus} null : pas de réponse.
 */
public record WebhookDeliveryResponse(
    String deliveryId,
    String eventType,
    String status,
    int attempts,
    Integer lastStatus,
    String lastError,
    LocalDateTime createdAt,
    LocalDateTime deliveredAt,
    LocalDateTime nextAttemptAt
) {}
