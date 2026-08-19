package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.WorkspaceRole;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse pour un membre de workspace
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkspaceMemberResponse {

    private Long id;
    private Long userId;
    private String email;
    private String displayName;
    private String avatarUrl;
    private WorkspaceRole role;
    private LocalDateTime joinedAt;
}
