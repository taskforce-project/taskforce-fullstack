package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import lombok.Builder;
import lombok.Data;

/**
 * Série d'activité d'UN projet, dans une réponse qui en porte plusieurs.
 *
 * <p>Existe pour servir la page Operations en <b>un seul appel</b> : chaque carte (et désormais
 * chaque ligne) affiche sa sparkline, ce qui revenait à interroger l'API une fois par projet —
 * autant de requêtes que de projets affichés, à chaque rendu de la page.</p>
 */
@Data
@Builder
public class ProjectActivitySeriesResponse {

    private Long projectId;

    /** Série continue : un point par jour de la fenêtre, à zéro s'il n'y a rien. */
    private List<ProjectActivityPointResponse> points;
}
