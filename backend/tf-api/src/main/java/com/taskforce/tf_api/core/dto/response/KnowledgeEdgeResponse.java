package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** DTO de réponse pour une arête du graphe de connaissance. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeEdgeResponse {

    private Long id;
    private Long fromNodeId;
    private Long toNodeId;
    private String relationType;
    private Double weight;
    private boolean auto;
}
