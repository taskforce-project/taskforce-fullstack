package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Usage vs limites du plan pour un workspace (PROD-4.2 — source de vérité anti-drift).
 * Une limite à {@code -1} signifie « illimité » (plan ENTERPRISE).
 */
@Data
@Builder
public class WorkspaceUsageResponse {

    /** Plan déterminant les limites membres (plan du propriétaire du workspace). */
    private String plan;

    private long membersUsed;
    private long membersLimit;

    private long workspacesUsed;
    private long workspacesLimit;
}
