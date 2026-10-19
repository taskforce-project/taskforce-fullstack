package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Création ou modification d'un webhook sortant. {@code eventTypes} vide ou absent = tous les événements ;
 * {@code active} absent = inchangé (actif à la création). Le secret de signature est généré par l'instance.
 */
public record WebhookRequest(
    @NotBlank @Size(max = 512)
    @Pattern(regexp = "https?://.*", message = "URL must start with http:// or https://")
    String url,

    List<String> eventTypes,

    Boolean active
) {}
