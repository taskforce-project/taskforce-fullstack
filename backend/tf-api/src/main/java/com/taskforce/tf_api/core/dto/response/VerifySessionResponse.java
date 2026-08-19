package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Réponse de vérification d'une session de paiement Stripe
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerifySessionResponse {
    
    /**
     * Email de l'utilisateur
     */
    private String email;
    
    /**
     * Type de plan acheté (PRO, ENTERPRISE, etc.)
     */
    private String planType;
    
    /**
     * Statut du paiement
     */
    private String paymentStatus;
    
    /**
     * ID de l'abonnement Stripe
     */
    private String subscriptionId;
    
    /**
     * ID du client Stripe
     */
    private String customerId;
    
    /**
     * Indique si l'utilisateur a été créé avec succès
     */
    private boolean userCreated;
    
    /**
     * Message de succès ou d'erreur
     */
    private String message;
}
