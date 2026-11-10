package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Ce qu'une mission a changé, relevé par le runner dans son dossier de travail (R139, séance n°20) : l'état réel, jamais
 * ce que l'agent en dit.
 *
 * @param mode    {@code repo} (un worktree git) ou {@code scratch} (un dossier jetable, sans dépôt)
 * @param base    le commit d'où part la mission ; absent d'un dossier jetable
 * @param files   les fichiers, 500 au plus ; un relevé remplace le précédent
 * @param more    les fichiers au-delà du plafond du runner, comptés dans les totaux
 * @param added   lignes ajoutées, tous fichiers confondus
 * @param removed lignes retirées, tous fichiers confondus
 * @param final_  l'état final de la mission : il entre à son dossier de preuve
 */
public record RunnerChangesRequest(
    @NotBlank @Pattern(regexp = "repo|scratch", message = "mode must be repo or scratch")
    String mode,

    @Pattern(regexp = "[0-9a-f]{40,64}", message = "base must be a commit hash")
    String base,

    @NotNull @Size(max = 500)
    List<@Valid File> files,

    @Min(0)
    int more,

    @Min(0)
    long added,

    @Min(0)
    long removed,

    @com.fasterxml.jackson.annotation.JsonProperty("final")
    boolean final_
) {

    /**
     * @param revision l'empreinte de ce qui a changé : à empreinte égale, le texte déjà reçu est gardé
     * @param body     le patch ou le contenu ; absent quand il n'a pas changé, ou qu'il ne part pas
     */
    public record File(
        @NotBlank @Size(max = 1000) @Pattern(regexp = "[^\\x00]+", message = "path must not hold a NUL")
        String path,

        @NotBlank @Pattern(regexp = "added|modified|deleted|written", message = "status must be added, modified, deleted or written")
        String status,

        @Min(0) Integer added,
        @Min(0) Integer removed,
        boolean binary,
        boolean truncated,
        boolean withheld,

        @NotBlank @Size(max = 64)
        String revision,

        @Size(max = 70_000)
        String body
    ) {}
}
