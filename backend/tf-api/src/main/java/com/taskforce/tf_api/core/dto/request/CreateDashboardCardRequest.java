package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Ajoute une carte au dashboard : type (clé du registre front), titre et période optionnels, config
 * libre (en structure JDK pour rester neutre vis-à-vis du sérialiseur). La position est calculée
 * côté service (fin de liste).
 */
@Data
public class CreateDashboardCardRequest {

    @NotBlank(message = "The card type is required")
    @Size(max = 40, message = "The card type can't exceed 40 characters")
    private String cardType;

    @Size(max = 200, message = "The title can't exceed 200 characters")
    private String title;

    private Map<String, Object> config;

    @Size(max = 10, message = "The period can't exceed 10 characters")
    private String timeRange;
}
