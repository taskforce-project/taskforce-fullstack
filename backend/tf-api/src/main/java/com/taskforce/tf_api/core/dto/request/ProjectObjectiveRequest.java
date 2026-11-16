package com.taskforce.tf_api.core.dto.request;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Corps de PUT /api/workspaces/{slug}/projects/{id}/objective : l'objectif du projet, posé ou remplacé en entier (la vue
 * du workflow, lot W1). Le service retire les espaces autour du but et de chaque critère, et refuse ce qui reste vide.
 *
 * @param goal       le but, en une phrase : 280 caractères au plus
 * @param targetDate la date visée ; absente : aucune
 * @param criteria   d'un à cinq critères de réussite, 200 caractères au plus chacun
 */
public record ProjectObjectiveRequest(
    @NotBlank(message = "Write the goal of the project in one sentence")
    @Size(min = 1, max = 280, message = "The goal is 280 characters at most")
    String goal,
    LocalDate targetDate,
    @NotNull(message = "Give one to five success criteria")
    @Size(min = 1, max = 5, message = "Give one to five success criteria")
    List<@NotBlank(message = "A success criterion can't be empty")
        @Size(min = 1, max = 200, message = "A success criterion is 200 characters at most") String> criteria
) {}
