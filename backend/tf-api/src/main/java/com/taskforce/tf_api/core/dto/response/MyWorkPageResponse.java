package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Page (doc projet) vue depuis « Ma file » : la page <b>plus le projet qui la porte</b>.
 *
 * <p>Même raison d'être que {@link MyWorkCycleResponse} : la vue est cross-projets et a besoin du
 * couple (id, nom) du projet pour afficher la colonne et construire le lien, là où
 * {@link PageResponse} est servi depuis une route déjà scopée par projet.</p>
 */
@Data
@Builder
public class MyWorkPageResponse {

    private Long         projectId;
    private String       projectName;
    private PageResponse page;
}
