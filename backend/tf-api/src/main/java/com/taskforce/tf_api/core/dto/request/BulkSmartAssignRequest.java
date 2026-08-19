package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

/**
 * Demande de recommandation Smart Assign en lot (multi-assign).
 * {@code issueIds} = issues (typiquement non assignées) à scorer.
 */
@Data
public class BulkSmartAssignRequest {

    @NotEmpty(message = "Au moins une issue est requise")
    private List<Long> issueIds;
}
