package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Les commentaires d'une relecture, envoyés ensemble (R139) : ils lancent une reprise sur la même branche.
 *
 * @param comments 50 au plus
 */
public record MissionFollowUpRequest(
    @NotEmpty @Size(max = 50)
    List<@Valid Comment> comments
) {

    /**
     * @param path le fichier
     * @param line le numéro de la ligne, dans la version de l'agent ({@code new}) ou dans celle d'avant ({@code old})
     * @param side {@code new} ou {@code old}
     * @param text ce que la personne demande
     */
    public record Comment(
        @NotBlank @Size(max = 1000) String path,
        @Min(1) int line,
        @NotBlank @Pattern(regexp = "new|old", message = "side must be new or old") String side,
        @NotBlank @Size(max = 2000) String text
    ) {}
}
