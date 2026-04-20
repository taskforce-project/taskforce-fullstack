package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.ProjectRole;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Corps de la requête POST /api/workspaces/{slug}/projects/{id}/members
 */
@Data
public class AddProjectMemberRequest {

    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "Format d'email invalide")
    private String email;

    @NotNull(message = "Le rôle est obligatoire")
    private ProjectRole role;
}
