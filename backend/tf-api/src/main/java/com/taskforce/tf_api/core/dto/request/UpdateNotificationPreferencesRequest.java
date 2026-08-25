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

    @NotNull(message = "Liste de préférences requise")
    @Size(max = 20, message = "Trop de préférences")
    @Valid
    private List<Item> preferences;

    @Data
    public static class Item {

        @NotBlank(message = "eventKey requis")
        private String eventKey;

        @NotNull(message = "inApp requis")
        private Boolean inApp;

        @NotNull(message = "email requis")
        private Boolean email;
    }
}
