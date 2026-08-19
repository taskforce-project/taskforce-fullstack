package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Mise à jour partielle d'une carte de dashboard : null = champ inchangé.
 */
@Data
public class UpdateDashboardCardRequest {

    @Size(max = 200, message = "Le titre ne peut pas dépasser 200 caractères")
    private String title;

    private Map<String, Object> config;

    @Size(max = 10, message = "La période ne peut pas dépasser 10 caractères")
    private String timeRange;
}
