package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Cycle vu depuis « Ma file » : le cycle <b>plus le projet qui le porte</b>.
 *
 * <p>La vue « Ma file » est cross-projets — elle affiche la colonne « Projet » et construit un lien
 * {@code /{slug}/projects/{projectId}/cycles/{cycleId}}. {@link CycleResponse} ne transporte pas
 * cette information (il est toujours servi depuis une route déjà scopée par projet), d'où cette
 * enveloppe : sans elle, le client devrait rappeler l'API projet par projet — exactement le N+1 que
 * l'endpoint agrégé supprime.</p>
 */
@Data
@Builder
public class MyWorkCycleResponse {

    private Long          projectId;
    private String        projectName;
    private CycleResponse cycle;
}
