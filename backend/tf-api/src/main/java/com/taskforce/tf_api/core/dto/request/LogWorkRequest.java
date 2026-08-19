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
    @NotNull(message = "Le temps (minutes) est obligatoire")
    @Min(value = 1, message = "Le temps doit être positif")
    @Max(value = 1440, message = "Maximum 1440 minutes (24h) par entrée")
    private Integer minutes;

    @Size(max = 500, message = "La description ne peut pas dépasser 500 caractères")
    private String description;

    /** Date du travail (ISO yyyy-MM-dd). Optionnel → aujourd'hui par défaut. */
    private String loggedAt;
}
