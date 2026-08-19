package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.InvitationStatus;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.WorkspaceInvitation;

import lombok.Builder;
import lombok.Data;

/**
 * Vue admin d'une invitation (liste des invitations en attente).
 */
@Data
@Builder
public class InvitationResponse {

    private Long id;
    private String email;
    private WorkspaceRole role;
    private InvitationStatus status;
    private String invitedByName;
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;

    public static InvitationResponse from(WorkspaceInvitation inv) {
        String inviter = inv.getInvitedBy() != null
            ? (inv.getInvitedBy().getDisplayName() != null
                ? inv.getInvitedBy().getDisplayName()
                : inv.getInvitedBy().getEmail())
            : null;

        return InvitationResponse.builder()
            .id(inv.getId())
            .email(inv.getEmail())
            .role(inv.getRole())
            .status(inv.getStatus())
            .invitedByName(inviter)
            .expiresAt(inv.getExpiresAt())
            .createdAt(inv.getCreatedAt())
            .build();
    }
}
