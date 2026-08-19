package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Un point de l'historique de santé des opérations : combien de projets étaient
 * « à risque » et « critiques » ce jour-là.
 *
 * <p>Sert la courbe placée sous le KPI « At risk » de la page Operations. L'objectif produit
 * étant <b>zéro</b>, une ligne plate au plancher est l'état sain — et non une absence de données.</p>
 */
@Data
@Builder
public class ProjectHealthPointResponse {

    /** Jour au format ISO {@code YYYY-MM-DD}. */
    private String date;

    /** Projets dont le ratio d'issues ouvertes était dans la bande « à risque ». */
    private long atRisk;

    /** Projets dont le ratio dépassait le seuil critique. */
    private long critical;
}
