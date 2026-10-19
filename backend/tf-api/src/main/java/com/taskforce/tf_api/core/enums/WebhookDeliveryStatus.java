package com.taskforce.tf_api.core.enums;

/**
 * État d'un envoi de webhook : {@code PENDING} tant qu'une tentative reste à faire, {@code DELIVERED} après une
 * réponse 2xx, {@code FAILED} après la dernière tentative ou un refus définitif (adresse interne, webhook en pause).
 */
public enum WebhookDeliveryStatus {
    PENDING,
    DELIVERED,
    FAILED
}
