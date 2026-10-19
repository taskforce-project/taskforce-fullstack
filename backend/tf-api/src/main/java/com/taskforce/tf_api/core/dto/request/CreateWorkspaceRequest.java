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

    @NotBlank(message = "The name is required")
    @Size(min = 1, max = 100, message = "The name must be 1 to 100 characters long")
    private String name;

    @Size(max = 500, message = "The description can't exceed 500 characters")
    private String description;

    /**
     * Contexte metier : « que fait l'entreprise / equipe ? ». Optionnel, alimente le Brain OS.
     */
    @Size(max = 500, message = "The activity can't exceed 500 characters")
    private String activity;
}
