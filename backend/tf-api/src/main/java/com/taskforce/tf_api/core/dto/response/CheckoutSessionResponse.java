package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse après création d'une session de paiement Stripe
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutSessionResponse {

    private String sessionId;
    private String sessionUrl; // URL vers laquelle rediriger l'utilisateur pour payer
    private String status;
}
