package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Charge de travail de l'équipe (US-022) : heatmap membre × jour sur une fenêtre glissante.
 * Valeur d'une cellule = nombre d'issues OUVERTES assignées dont l'échéance (dueDate) tombe ce jour-là.
 */
public record WorkloadResponse(
    String from,
    String to,
    List<MemberWorkload> members
) {
    /** Charge d'un membre : total ouvert + série continue jour par jour. */
    public record MemberWorkload(
        Long          userId,
        String        displayName,
        String        avatarUrl,
        long          openIssues,
        Integer       capacityHoursPerWeek,
        List<DayLoad> days
    ) {}

    /** Charge d'un jour : date 'YYYY-MM-DD' + nombre d'échéances. */
    public record DayLoad(
        String date,
        long   count
    ) {}
}
