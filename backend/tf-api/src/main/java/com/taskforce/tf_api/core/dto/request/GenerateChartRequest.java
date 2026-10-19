package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Demande en langage naturel de générer un graphe (« montre-moi la charge par membre sur 30 jours »). */
@Data
public class GenerateChartRequest {

    @NotBlank(message = "The request is required")
    @Size(max = 500, message = "The request can't exceed 500 characters")
    private String prompt;

    /** Restreint l'analyse à un projet (null = tout l'espace de travail). */
    private Long projectId;
}
