package com.taskforce.tf_api.core.enums;

import java.util.Arrays;
import java.util.List;

/** Événements envoyés aux webhooks sortants (ADR-020), et l'événement de test envoyé à la demande. */
public enum WebhookEventType {
    ISSUE_CREATED("issue.created"),
    ISSUE_UPDATED("issue.updated"),
    ISSUE_DELETED("issue.deleted"),
    COMMENT_CREATED("comment.created"),
    CYCLE_COMPLETED("cycle.completed"),
    /** Envoyé par « Send test » seulement : on ne s'y abonne pas. */
    PING("ping");

    private final String key;

    WebhookEventType(String key) {
        this.key = key;
    }

    /** Nom de l'événement tel qu'envoyé (en-tête {@code X-TaskForce-Event}, champ {@code type}). */
    public String key() {
        return key;
    }

    /** Événements auxquels un webhook peut s'abonner. */
    public static List<String> subscribable() {
        return Arrays.stream(values()).filter(t -> t != PING).map(WebhookEventType::key).toList();
    }
}
