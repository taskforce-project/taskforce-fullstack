package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Réponse après sélection du plan (Étape 2)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SelectPlanResponse {

    private String message;
    private String email;
    private String planType;
    private boolean otpSent;
    private int otpExpiresInMinutes;
}
