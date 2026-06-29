package com.taskforce.tf_api.core.dto.request;

import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Création d'un node de connaissance. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateKnowledgeNodeRequest {

    @NotNull(message = "Le type est obligatoire")
    private String type;        // NodeType

    @NotNull(message = "Le domaine est obligatoire")
    private String domain;      // NodeDomain

    @NotBlank(message = "Le titre est obligatoire")
    @Size(max = 300)
    private String title;

    private String content;

    /** Lien optionnel vers une entité TaskForce. */
    private String refType;     // NodeRefType
    private Long refId;

    /** Tags explicites (les #tags du contenu sont aussi détectés automatiquement). */
    private List<String> tags;

    private Map<String, Object> metadata;
}
