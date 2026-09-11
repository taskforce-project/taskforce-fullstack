package com.taskforce.tf_api.core.dto.request;

import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Mise à jour partielle d'un node (champs null = inchangés). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateKnowledgeNodeRequest {

    @Size(max = 300)
    private String title;

    private String content;
    private String type;          // NodeType
    private String domain;        // NodeDomain
    private String status;        // NodeStatus
    private String versionLabel;
    private List<String> tags;

    /** Reparentage (arbre facon Notion) : non-null = deplace sous cette page ; null = inchange. */
    private Long parentNodeId;

    /** Projets de rattachement (plusieurs = note transverse) → {@code metadata.projects}. Voir {@link CreateKnowledgeNodeRequest}. */
    private List<Long> projects;

    private Map<String, Object> metadata;
}
