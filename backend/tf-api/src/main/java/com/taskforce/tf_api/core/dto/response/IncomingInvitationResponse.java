package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.WorkspaceInvitation;

import lombok.Builder;
import lombok.Data;

/**
 * Vue « invité » d'une invitation reçue (bannière d'approbation in-app).
 *
 * <p>Volontairement distincte d'{@link InvitationResponse} (vue admin) : elle porte le nom du
 * workspace et l'inviteur pour l'affichage, mais <b>jamais le token</b> — l'acceptation in-app se
 * fait par identifiant, avec contrôle d'accès sur l'email côté service.</p>
 */
@Data
@Builder
public class IncomingInvitationResponse {

    private Long id;
    private String workspaceName;
    private WorkspaceRole role;
    private String invitedByName;
    private LocalDateTime expiresAt;
    /** Nom du projet ciblé, si l'invitation porte sur un projet (sinon null = invitation workspace simple). */
    private String projectName;

    public static IncomingInvitationResponse from(WorkspaceInvitation inv) {
        String inviter = inv.getInvitedBy() != null
            ? (inv.getInvitedBy().getDisplayName() != null
                ? inv.getInvitedBy().getDisplayName()
                : inv.getInvitedBy().getEmail())
            : null;

        return IncomingInvitationResponse.builder()
            .id(inv.getId())
            .workspaceName(inv.getWorkspace().getName())
            .role(inv.getRole())
            .invitedByName(inviter)
            .expiresAt(inv.getExpiresAt())
            .projectName(inv.getProject() != null ? inv.getProject().getName() : null)
            .build();
    }
}
