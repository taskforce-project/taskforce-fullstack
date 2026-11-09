package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Recherche sémantique dans le Brain OS. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SearchBrainRequest {

    @NotBlank(message = "The query is required")
    @Size(max = 1000)
    private String query;

    /** Nombre de résultats (défaut 8, max 50 appliqué côté service). */
    private Integer topK;

    /** Filtre optionnel par domaine (NodeDomain). */
    private String domain;

    /**
     * Plein texte seulement, sans le modèle de vecteurs (Ctrl+K, R141) : on répond à la frappe, sans occuper le modèle
     * local, et une note ne sort que si elle contient ce qu'on tape. Chaque résultat porte son passage.
     */
    private Boolean textOnly;
}
