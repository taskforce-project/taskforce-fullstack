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

    @Size(min = 1, max = 100, message = "The name must be 1 to 100 characters long")
    private String name;

    @Size(max = 500, message = "The description can't exceed 500 characters")
    private String description;

    @Size(max = 500, message = "The activity can't exceed 500 characters")
    private String activity;

    @Size(max = 1000, message = "The logo URL can't exceed 1000 characters")
    private String logoUrl;
}
