package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Corps de POST …/delivery/issues/{issueId}/delegate — délègue une issue à un agent de livraison
 * (TF-AGENT-DELIVERY slice 3).
 */
@Data
public class DelegateRequest {

    /** Clé du provider ("claude-code"). Doit être disponible. */
    @NotBlank(message = "The provider is required")
    private String providerKey;

    /** Modèle souhaité (optionnel ; défaut = premier modèle du provider). */
    private String model;
}
