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

    @NotBlank(message = "La requête est obligatoire")
    @Size(max = 1000)
    private String query;

    /** Nombre de résultats (défaut 8, max 50 appliqué côté service). */
    private Integer topK;

    /** Filtre optionnel par domaine (NodeDomain). */
    private String domain;
}
