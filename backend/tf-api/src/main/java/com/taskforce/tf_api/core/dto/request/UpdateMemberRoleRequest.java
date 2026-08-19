package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.WorkspaceRole;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour changer le rôle d'un membre dans un workspace
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateMemberRoleRequest {

    @NotNull(message = "Le rôle est obligatoire")
    private WorkspaceRole role;
}
