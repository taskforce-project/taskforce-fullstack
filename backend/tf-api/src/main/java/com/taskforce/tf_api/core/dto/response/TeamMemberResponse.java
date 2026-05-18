package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.TeamRole;
import com.taskforce.tf_api.core.model.TeamMember;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TeamMemberResponse {

    private Long        id;
    private Long        userId;
    private String      displayName;
    private String      initials;
    private String      avatarUrl;
    private TeamRole    role;
    private LocalDateTime joinedAt;

    public static TeamMemberResponse from(TeamMember m) {
        String name = m.getUser().getDisplayName();
        return TeamMemberResponse.builder()
            .id(m.getId())
            .userId(m.getUser().getId())
            .displayName(name)
            .initials(buildInitials(name))
            .avatarUrl(m.getUser().getAvatarUrl())
            .role(m.getRole())
            .joinedAt(m.getJoinedAt())
            .build();
    }

    private static String buildInitials(String displayName) {
        if (displayName == null || displayName.isBlank()) return "?";
        String[] parts = displayName.trim().split("\\s+");
        if (parts.length == 1) return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        return (String.valueOf(parts[0].charAt(0)) + String.valueOf(parts[parts.length - 1].charAt(0))).toUpperCase();
    }
}
