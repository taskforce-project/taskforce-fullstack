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

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotNull(message = "The role is required")
    private ProjectRole role;
}
