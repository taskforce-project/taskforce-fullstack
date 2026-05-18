package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.model.Team;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TeamResponse {

    private Long                      id;
    private String                    name;
    private String                    description;
    private String                    emoji;
    private String                    color;
    private List<TeamMemberResponse>  members;
    private LocalDateTime             createdAt;
    private LocalDateTime             updatedAt;

    public static TeamResponse from(Team team, List<TeamMemberResponse> members) {
        return TeamResponse.builder()
            .id(team.getId())
            .name(team.getName())
            .description(team.getDescription())
            .emoji(team.getEmoji())
            .color(team.getColor())
            .members(members)
            .createdAt(team.getCreatedAt())
            .updatedAt(team.getUpdatedAt())
            .build();
    }
}
