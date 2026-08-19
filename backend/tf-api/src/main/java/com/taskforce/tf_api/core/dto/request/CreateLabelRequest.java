package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Corps de la requête POST /api/workspaces/{slug}/projects/{id}/labels
 */
@Data
public class CreateLabelRequest {

    @NotBlank(message = "Le nom du label est obligatoire")
    @Size(min = 1, max = 50)
    private String name;

    @Size(max = 30)
    private String color;

    @Size(max = 200)
    private String description;
}
