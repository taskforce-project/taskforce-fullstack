package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Corps de POST /api/workspaces/{slug}/projects/{id}/teams (PROD-3.6b).
 */
@Data
public class AttachProjectTeamRequest {

    @NotNull(message = "teamId est obligatoire")
    private Long teamId;
}
