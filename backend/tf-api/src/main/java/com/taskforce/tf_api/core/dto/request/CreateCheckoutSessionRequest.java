package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour créer une session de paiement Stripe
 * L'API Java communique avec Stripe, pas le frontend directement
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateCheckoutSessionRequest {

    @NotBlank(message = "Le type de plan est obligatoire")
    private String planType; // PREMIUM, ENTERPRISE

    private String successUrl; // URL de redirection après paiement réussi

    private String cancelUrl; // URL de redirection si l'utilisateur annule
}
