package com.taskforce.tf_api.core.dto.response;

import com.taskforce.tf_api.core.model.Team;

import lombok.Builder;
import lombok.Data;

/**
 * Résumé d'une équipe associée à un projet (PROD-3.6b).
 */
@Data
@Builder
public class ProjectTeamResponse {

    private Long teamId;
    private String name;
    private String emoji;
    private String color;
    private long memberCount;

    public static ProjectTeamResponse from(Team team, long memberCount) {
        return ProjectTeamResponse.builder()
            .teamId(team.getId())
            .name(team.getName())
            .emoji(team.getEmoji())
            .color(team.getColor())
            .memberCount(memberCount)
            .build();
    }
}
