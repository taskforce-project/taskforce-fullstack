package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Résultat de l'application d'un plan de redistribution (PROD-1.12). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApplyRedistributionResponse {

    /** Déplacements réellement appliqués. */
    private int applied;
    /** Déplacements ignorés (issue introuvable/hors workspace, cible non membre). */
    private int skipped;
}
