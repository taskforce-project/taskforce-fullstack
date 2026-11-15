package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * L'objectif d'un projet tel que la vue du workflow le montre (lot W1). Un projet sans objectif rend un objectif vide :
 * {@code goal} null, aucun critère, ni date, ni auteur.
 *
 * @param goal       le but, en une phrase ; null quand le projet n'a pas d'objectif
 * @param targetDate la date visée ; null quand il n'y en a pas
 * @param criteria   les critères de réussite, dans l'ordre où ils ont été donnés ; vide sans objectif
 * @param updatedBy  qui l'a posé ou changé en dernier : son nom affiché, sinon son adresse ; null sans objectif, ou quand
 *                   cette personne n'existe plus
 * @param updatedAt  quand ; null sans objectif
 * @param canEdit    l'appelant peut poser ou retirer l'objectif : responsable (LEAD) du projet, ou propriétaire ou
 *                   administrateur de l'espace
 */
public record ProjectObjectiveResponse(
    String goal,
    LocalDate targetDate,
    List<String> criteria,
    String updatedBy,
    LocalDateTime updatedAt,
    boolean canEdit
) {

    /** L'objectif vide d'un projet qui n'en a pas. */
    public static ProjectObjectiveResponse none(boolean canEdit) {
        return new ProjectObjectiveResponse(null, null, List.of(), null, null, canEdit);
    }
}
