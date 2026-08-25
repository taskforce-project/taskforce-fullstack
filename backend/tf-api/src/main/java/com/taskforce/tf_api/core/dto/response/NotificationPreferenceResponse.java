package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Réglage de notification d'un utilisateur pour un événement, par canal.
 * Le front associe {@code eventKey} à un libellé/description (copie côté UI).
 */
@Data
@Builder
public class NotificationPreferenceResponse {

    /** assigned | mention | commented | statusChanged | dueDate | overload */
    private String eventKey;

    /** Canal in-app (cloche + temps réel). */
    private boolean inApp;

    /** Canal email (opt-in). */
    private boolean email;
}
