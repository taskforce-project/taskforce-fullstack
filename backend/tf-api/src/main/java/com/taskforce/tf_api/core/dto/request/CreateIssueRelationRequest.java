package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Crée une relation entre l'issue courante et une autre issue.
 */
@Data
public class CreateIssueRelationRequest {

    /** ID de l'issue cible */
    @NotNull
    private Long targetIssueId;

    /**
     * Type de relation : BLOCKS | BLOCKED_BY | DUPLICATE | RELATES_TO
     */
    @NotBlank
    private String relationType;
}
