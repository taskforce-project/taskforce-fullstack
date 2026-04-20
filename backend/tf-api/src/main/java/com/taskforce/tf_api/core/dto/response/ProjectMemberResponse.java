package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.ProjectRole;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse pour un membre d'un projet
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectMemberResponse {

    private Long id;
    private Long userId;
    private String email;
    private String displayName;
    private String avatarUrl;
    private ProjectRole role;
    private LocalDateTime joinedAt;
}
