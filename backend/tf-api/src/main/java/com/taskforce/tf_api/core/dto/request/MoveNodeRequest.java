package com.taskforce.tf_api.core.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Deplacement d'une page dans l'arbre du Brain OS (drag-to-nest facon Notion).
 * Contrairement a {@code UpdateKnowledgeNodeRequest} (ou {@code parentNodeId} null = inchange), ici
 * {@code parentNodeId} null est EXPLICITE = remonter la page a la racine de son domaine.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MoveNodeRequest {

    /** Nouvelle page parente ; null = racine du domaine. */
    private Long parentNodeId;

    /** Domaine cible (coherence quand on deplace ailleurs) ; null = domaine inchange. */
    private String domain;
}
