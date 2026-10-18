package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Mise à jour des réglages de notification de l'utilisateur courant.
 * Les {@code eventKey} inconnus sont ignorés côté service (robustesse front/back).
 */
@Data
public class UpdateNotificationPreferencesRequest {

    @NotNull(message = "A list of preferences is required")
    @Size(max = 20, message = "Too many preferences")
    @Valid
    private List<Item> preferences;

    @Data
    public static class Item {

        @NotBlank(message = "eventKey is required")
        private String eventKey;

        @NotNull(message = "inApp is required")
        private Boolean inApp;

        @NotNull(message = "email is required")
        private Boolean email;
    }
}
