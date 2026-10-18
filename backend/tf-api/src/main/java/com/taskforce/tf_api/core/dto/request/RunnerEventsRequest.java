package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Lot d'événements de la chronologie d'un run, posté par le runner local (OSS-5.3).
 *
 * @param events 50 au plus par appel ; le texte est tronqué à 2000 caractères au stockage
 */
public record RunnerEventsRequest(
    @NotEmpty @Size(max = 50)
    List<@Valid Event> events
) {

    public record Event(
        @NotBlank @Pattern(regexp = "start|text|tool|error|denied", message = "kind must be start, text, tool, error or denied")
        String kind,

        @Size(max = 120)
        String tool,

        @NotNull @Size(max = 4000)
        String text
    ) {}
}
