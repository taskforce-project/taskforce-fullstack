package com.taskforce.tf_api.core.model;

import java.util.Optional;

/**
 * Catalogue des événements de notification, côté <b>préférences utilisateur</b>.
 *
 * <p>Les notifications persistées portent un {@code type} libre (String) — 8 valeurs au total,
 * écrites par {@link com.taskforce.tf_api.core.service.NotificationService}. Pour les <b>réglages</b>
 * (canaux in-app / email), on regroupe ces types en 6 événements actionnables : {@code completed}
 * suit {@code statusChanged} et {@code overdue} suit {@code dueSoon} (même intention pour l'utilisateur).</p>
 *
 * <p>{@link #key()} est ce qui est persisté dans {@code notification_preferences.event_key} et
 * échangé avec le front.</p>
 */
public enum NotificationEvent {

    ASSIGNED("assigned"),
    MENTION("mention"),
    COMMENTED("commented"),
    STATUS_CHANGED("statusChanged"),
    DUE_DATE("dueDate"),
    OVERLOAD("overload");

    private final String key;

    NotificationEvent(String key) {
        this.key = key;
    }

    /** Clé stable stockée en base et exposée au front. */
    public String key() {
        return key;
    }

    /**
     * Résout l'événement de réglage depuis le {@code type} d'une notification persistée.
     * Un type inconnu renvoie {@link Optional#empty()} : l'appelant applique alors le comportement
     * historique (in-app actif, email inactif) pour ne jamais régresser.
     */
    public static Optional<NotificationEvent> fromType(String type) {
        if (type == null) return Optional.empty();
        return switch (type) {
            case "assigned", "assignmentDeclined" -> Optional.of(ASSIGNED);
            case "mention" -> Optional.of(MENTION);
            case "commented" -> Optional.of(COMMENTED);
            case "statusChanged", "completed" -> Optional.of(STATUS_CHANGED);
            case "dueSoon", "overdue" -> Optional.of(DUE_DATE);
            case "overload" -> Optional.of(OVERLOAD);
            default -> Optional.empty();
        };
    }

    /** Résout l'événement depuis une clé de réglage (event_key). */
    public static Optional<NotificationEvent> fromKey(String key) {
        if (key == null) return Optional.empty();
        for (NotificationEvent event : values()) {
            if (event.key.equals(key)) return Optional.of(event);
        }
        return Optional.empty();
    }
}
