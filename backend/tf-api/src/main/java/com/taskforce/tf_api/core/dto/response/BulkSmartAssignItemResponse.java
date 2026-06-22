package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Recommandation Smart Assign pour une issue d'un lot (multi-assign).
 * Le front rapproche {@code issueId} de sa liste d'issues pour l'affichage (titre/identifiant).
 */
@Data
@Builder
public class BulkSmartAssignItemResponse {

    private Long issueId;
    /** Meilleur candidat, ou null si aucun (projet sans membre actif). */
    private SmartAssignCandidateResponse recommended;
}
