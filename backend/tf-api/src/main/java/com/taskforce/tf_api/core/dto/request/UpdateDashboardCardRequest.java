package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Mise à jour partielle d'une carte de dashboard : null = champ inchangé.
 */
@Data
public class UpdateDashboardCardRequest {

    @Size(max = 200, message = "The title can't exceed 200 characters")
    private String title;

    private Map<String, Object> config;

    @Size(max = 10, message = "The period can't exceed 10 characters")
    private String timeRange;
}
