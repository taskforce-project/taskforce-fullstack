package com.taskforce.tf_api.core.api;

import com.stripe.exception.StripeException;
import com.taskforce.tf_api.core.dto.response.VerifySessionResponse;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.core.service.AuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Contrôleur REST pour les opérations Stripe
 */
@RestController
@RequestMapping("/api/stripe")
@RequiredArgsConstructor
@Slf4j
public class StripeController {

    private final AuthService authService;

    /**
     * Vérifie une session de paiement Stripe et finalise l'inscription de l'utilisateur
     * 
     * @param sessionId ID de la session Stripe Checkout
     * @return Réponse avec les détails de la vérification
     */
    @GetMapping("/verify-session")
    public ResponseEntity<ApiResponse<VerifySessionResponse>> verifySession(
        @RequestParam("session_id") String sessionId
    ) {
        log.info("Demande de vérification de session Stripe : {}", sessionId);

        try {
            VerifySessionResponse response = authService.completeRegistrationAfterPayment(sessionId);
            
            return ResponseEntity.ok(
                ApiResponse.success("Paiement vérifié avec succès", response)
            );
        } catch (StripeException e) {
            log.error("Erreur Stripe lors de la vérification de session {} : {}", sessionId, e.getMessage(), e);
            return ResponseEntity.badRequest().body(
                ApiResponse.error("Erreur lors de la vérification du paiement Stripe: " + e.getMessage())
            );
        } catch (Exception e) {
            log.error("Erreur lors de la vérification de session {} : {}", sessionId, e.getMessage(), e);
            return ResponseEntity.internalServerError().body(
                ApiResponse.error("Erreur lors de la finalisation de l'inscription: " + e.getMessage())
            );
        }
    }
}
