package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Corps de POST /api/workspaces/{slug}/invitations (PROD-3.5).
 * Invite un email — qu'il ait un compte ou non.
 */
@Data
public class CreateInvitationRequest {

    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "Email invalide")
    private String email;

    /** Rôle cible dans le workspace (défaut MEMBER). */
    private WorkspaceRole role;

    /** Optionnel : projet ciblé — l'acceptation ajoutera aussi l'invité à ce projet. */
    private Long projectId;

    /** Rôle dans le projet ciblé (défaut MEMBER si {@link #projectId} présent). */
    private ProjectRole projectRole;
}
