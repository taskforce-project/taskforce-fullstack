package com.taskforce.tf_api.core.service.webhook;

import com.taskforce.tf_api.core.enums.WebhookEventType;

/**
 * Événement d'un workspace à envoyer à ses webhooks (OSS-6.2). Publié par les services métier dans leur
 * transaction ; {@link WebhookOutbox} en écrit les envois avant le commit.
 *
 * @param workspaceId workspace dont les webhooks reçoivent l'événement
 * @param type        type d'événement
 * @param actorId     personne à l'origine du changement, ou null
 * @param data        objet {@code data} du corps envoyé (ex. {@code {"issue": …}}), sérialisé en JSON
 * @param path        chemin de l'application vers l'objet (ex. {@code /acme/projects/3/issues/42}), ou null
 */
public record WorkspaceWebhookEvent(Long workspaceId, WebhookEventType type, Long actorId, Object data, String path) {}
