package com.taskforce.tf_api.core.dto.response;

import java.util.List;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Vue d'ensemble d'un Brain OS : métadonnées + comptage par domaine + nodes + arêtes.
 * Permet au frontend de rendre le graphe et le navigateur de domaines en un seul appel.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BrainOverviewResponse {

    private Long brainId;
    private Long workspaceId;
    private String templateType;
    private String versionLabel;
    private long totalNodes;

    /** Comptage de nodes actifs par domaine (clé = nom du domaine). */
    private Map<String, Long> nodesByDomain;

    private List<KnowledgeNodeResponse> nodes;
    private List<KnowledgeEdgeResponse> edges;
}
