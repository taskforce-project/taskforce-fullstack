package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.TeamRole;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class AddTeamMemberRequest {

    @NotNull
    private Long userId;

    private TeamRole role = TeamRole.MEMBER;
}
