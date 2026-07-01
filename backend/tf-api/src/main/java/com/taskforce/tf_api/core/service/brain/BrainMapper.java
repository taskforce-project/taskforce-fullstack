package com.taskforce.tf_api.core.service.brain;

import java.util.List;

import com.taskforce.tf_api.core.dto.response.KnowledgeEdgeResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.model.KnowledgeEdge;
import com.taskforce.tf_api.core.model.KnowledgeNode;

/** Mapping entité → DTO pour le Brain OS. Util sans état (partagé CRUD + recherche). */
public final class BrainMapper {

    private BrainMapper() {}

    /** Extrait les tags depuis metadata.tags (stockés par BrainLinkService). */
    @SuppressWarnings("unchecked")
    private static List<String> tagsOf(KnowledgeNode n) {
        Object raw = n.getMetadata() != null ? n.getMetadata().get("tags") : null;
        if (raw instanceof List<?> list) {
            return list.stream().filter(o -> o != null).map(Object::toString).toList();
        }
        return List.of();
    }

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
            .parentNodeId(n.getParentNodeId())
            .tags(tagsOf(n))
            .system(n.getMetadata() != null && Boolean.TRUE.equals(n.getMetadata().get("system")))
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
            .auto(Boolean.TRUE.equals(e.getAuto()))
            .build();
    }
}
