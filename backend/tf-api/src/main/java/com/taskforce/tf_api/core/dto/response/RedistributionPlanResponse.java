package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Plan de redistribution proposé (PROD-1.12, trou CDC #4 « ajustements dynamiques »).
 * Human-in-the-loop : ce plan est un <b>preview</b> — un OWNER/ADMIN le valide (apply) ou le rejette.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RedistributionPlanResponse {

    /** Seuil de surcharge appliqué (tâches ouvertes). */
    private int threshold;
    /** Nombre de déplacements proposés. */
    private int totalMoves;
    private List<RedistributionMoveResponse> moves;
    /** Charge avant/après des membres concernés (source surchargée + cibles). */
    private List<MemberLoadResponse> memberLoads;
}
