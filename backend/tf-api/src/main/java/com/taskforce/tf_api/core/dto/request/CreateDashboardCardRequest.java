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

    @NotBlank(message = "Le type de carte est obligatoire")
    @Size(max = 40, message = "Le type de carte ne peut pas dépasser 40 caractères")
    private String cardType;

    @Size(max = 200, message = "Le titre ne peut pas dépasser 200 caractères")
    private String title;

    private Map<String, Object> config;

    @Size(max = 10, message = "La période ne peut pas dépasser 10 caractères")
    private String timeRange;
}
