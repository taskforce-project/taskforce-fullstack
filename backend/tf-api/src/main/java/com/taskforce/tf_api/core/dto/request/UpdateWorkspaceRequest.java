package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour mettre à jour les informations d'un workspace
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateWorkspaceRequest {

    @Size(min = 1, max = 100, message = "Le nom doit faire entre 1 et 100 caractères")
    private String name;

    @Size(max = 500, message = "La description ne peut pas dépasser 500 caractères")
    private String description;

    @Size(max = 1000, message = "L'URL du logo ne peut pas dépasser 1000 caractères")
    private String logoUrl;
}
