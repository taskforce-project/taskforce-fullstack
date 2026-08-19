package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Création d'une arête entre deux nodes. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateKnowledgeEdgeRequest {

    @NotNull(message = "fromNodeId est obligatoire")
    private Long fromNodeId;

    @NotNull(message = "toNodeId est obligatoire")
    private Long toNodeId;

    @NotNull(message = "relationType est obligatoire")
    private String relationType;  // EdgeRelation

    private Double weight;
}
