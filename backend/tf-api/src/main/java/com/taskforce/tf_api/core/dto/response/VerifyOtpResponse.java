package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse après vérification OTP réussie
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VerifyOtpResponse {

    private Boolean verified;
    private String message;
    private AuthResponse authData; // Tokens JWT si vérification réussie
    private String checkoutSessionUrl; // URL Stripe si plan payant sélectionné
}
