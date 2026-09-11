package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour créer un nouveau workspace
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateWorkspaceRequest {

    @NotBlank(message = "Le nom est obligatoire")
    @Size(min = 1, max = 100, message = "Le nom doit faire entre 1 et 100 caractères")
    private String name;

    @Size(max = 500, message = "La description ne peut pas dépasser 500 caractères")
    private String description;

    /**
     * Contexte metier : « que fait l'entreprise / equipe ? ». Optionnel, alimente le Brain OS.
     */
    @Size(max = 500, message = "L'activité ne peut pas dépasser 500 caractères")
    private String activity;

    /**
     * Gabarit d'amorçage du Brain OS : BLANK (défaut), SAAS, ECOMMERCE, MARKETPLACE, AGENTIC.
     * Optionnel — null = BLANK (architecture vierge, 16 domaines).
     */
    private String brainTemplate;
}
