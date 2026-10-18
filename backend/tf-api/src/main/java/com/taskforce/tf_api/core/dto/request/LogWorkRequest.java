package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Corps de POST .../issues/{id}/worklogs (time tracking, BE-ISS-012).
 */
@Data
public class LogWorkRequest {

    /** Temps passé en minutes (max 24h = 1440). */
    @NotNull(message = "The time (minutes) is required")
    @Min(value = 1, message = "The time must be positive")
    @Max(value = 1440, message = "1440 minutes (24 h) at most per entry")
    private Integer minutes;

    @Size(max = 500, message = "The description can't exceed 500 characters")
    private String description;

    /** Date du travail (ISO yyyy-MM-dd). Optionnel → aujourd'hui par défaut. */
    private String loggedAt;
}
