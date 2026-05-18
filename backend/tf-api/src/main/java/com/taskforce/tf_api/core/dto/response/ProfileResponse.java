package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Réponse combinée pour la page profil de l'utilisateur courant.
 * Contient les statistiques, le feed d'activité récent et les données heatmap.
 */
public record ProfileResponse(
    Stats stats,
    List<ActivityEntry> activity,
    List<HeatmapEntry> heatmap
) {

    /**
     * KPIs du profil utilisateur dans le workspace.
     */
    public record Stats(
        long issuesCreated,
        long issuesClosed,
        long cyclesCompleted,
        long daysActive,
        long teammateCount
    ) {}

    /**
     * Une entrée du feed d'activité récente.
     */
    public record ActivityEntry(
        Long   id,
        String type,
        String issueTitle,
        String issueIdentifier,
        String projectName,
        String createdAt
    ) {}

    /**
     * Un point de données du heatmap : date ISO (yyyy-MM-dd) + nombre d'activités.
     */
    public record HeatmapEntry(
        String date,
        long   count
    ) {}
}
