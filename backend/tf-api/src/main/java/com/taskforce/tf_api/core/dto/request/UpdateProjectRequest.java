package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.ProjectStatus;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Corps de la requête PATCH /api/workspaces/{slug}/projects/{id}
 * Tous les champs sont optionnels (patch partiel).
 */
@Data
public class UpdateProjectRequest {

    @Size(min = 1, max = 150)
    private String name;

    @Size(max = 1000)
    private String description;

    private ProjectStatus status;

    private Boolean isPublic;
}
