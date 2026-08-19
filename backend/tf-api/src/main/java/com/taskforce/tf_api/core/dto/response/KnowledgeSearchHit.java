package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Un résultat de recherche sémantique : le node + son score de similarité cosine [0..1]. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeSearchHit {
    private KnowledgeNodeResponse node;
    private double score;
}
