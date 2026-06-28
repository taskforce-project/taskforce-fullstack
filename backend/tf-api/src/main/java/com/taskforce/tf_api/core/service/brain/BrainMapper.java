package com.taskforce.tf_api.core.service.brain;

import com.taskforce.tf_api.core.dto.response.KnowledgeEdgeResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.model.KnowledgeEdge;
import com.taskforce.tf_api.core.model.KnowledgeNode;

/** Mapping entité → DTO pour le Brain OS. Util sans état (partagé CRUD + recherche). */
public final class BrainMapper {

    private BrainMapper() {}

    public static KnowledgeNodeResponse toNodeResponse(KnowledgeNode n) {
        return KnowledgeNodeResponse.builder()
            .id(n.getId())
            .uuid(n.getUuid() != null ? n.getUuid().toString() : null)
            .type(n.getType().name())
            .domain(n.getDomain().name())
            .domainCode(n.getDomain().getCode())
            .title(n.getTitle())
            .content(n.getContent())
            .contentUrl(n.getContentUrl())
            .status(n.getStatus().name())
            .versionLabel(n.getVersionLabel())
            .refType(n.getRefType() != null ? n.getRefType().name() : null)
            .refId(n.getRefId())
            .metadata(n.getMetadata())
            .createdAt(n.getCreatedAt())
            .updatedAt(n.getUpdatedAt())
            .createdBy(n.getCreatedBy())
            .build();
    }

    public static KnowledgeEdgeResponse toEdgeResponse(KnowledgeEdge e) {
        return KnowledgeEdgeResponse.builder()
            .id(e.getId())
            .fromNodeId(e.getFromNode().getId())
            .toNodeId(e.getToNode().getId())
            .relationType(e.getRelationType().name())
            .weight(e.getWeight())
            .build();
    }
}
