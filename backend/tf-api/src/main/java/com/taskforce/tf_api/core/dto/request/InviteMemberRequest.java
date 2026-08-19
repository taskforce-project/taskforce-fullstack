package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.WorkspaceRole;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour inviter un membre dans un workspace
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InviteMemberRequest {

    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "Format d'email invalide")
    private String email;

    /** Rôle attribué (MEMBER par défaut ; OWNER refusé côté service) */
    private WorkspaceRole role;
}
