package com.taskforce.tf_api.core.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.stripe.exception.StripeException;
import com.taskforce.tf_api.core.dto.request.PortalSessionRequest;
import com.taskforce.tf_api.core.dto.response.PortalSessionResponse;
import com.taskforce.tf_api.core.dto.response.SubscriptionInfoResponse;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.Subscription;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.SubscriptionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.StripeService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Facturation self-service (PROD-4.5) — chemin protége (distinct du /api/stripe public).
 */
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController {

    private final StripeService stripeService;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    /**
     * Abonnement courant de l'utilisateur authentifié (lecture depuis le profil — pas d'appel Stripe).
     * Chemin protégé (contrairement à {@code /api/stripe/**} public). Renvoie toujours 200 (repli FREE).
     */
    @GetMapping("/subscription")
    public ResponseEntity<ApiResponse<SubscriptionInfoResponse>> getSubscription(
        @AuthenticationPrincipal Jwt jwt
    ) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        PlanType plan = user.getPlanType() != null ? user.getPlanType() : PlanType.FREE;
        String status = user.getPlanStatus() != null
            ? user.getPlanStatus().name()
            : (plan == PlanType.FREE ? "FREE" : "ACTIVE");
        String periodEnd = user.getSubscriptionEndDate() != null ? user.getSubscriptionEndDate().toString() : null;
        SubscriptionInfoResponse info = new SubscriptionInfoResponse(
            user.getId(), plan.name(), status, periodEnd, false);
        return ResponseEntity.ok(ApiResponse.success("Abonnement récupéré", info));
    }

    /** Crée une session Stripe Customer Portal et renvoie l'URL de redirection. */
    @PostMapping("/portal")
    public ResponseEntity<ApiResponse<PortalSessionResponse>> createPortalSession(
        @AuthenticationPrincipal Jwt jwt,
        @RequestBody(required = false) PortalSessionRequest request
    ) throws StripeException {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        Subscription subscription = subscriptionRepository.findByUserId(user.getId())
            .filter(s -> s.getStripeCustomerId() != null && !s.getStripeCustomerId().isBlank())
            .orElseThrow(() -> new IllegalStateException(
                "Aucun abonnement à gérer (plan gratuit). Souscrivez d'abord à un plan payant."));

        String returnUrl = (request != null && request.getReturnUrl() != null && !request.getReturnUrl().isBlank())
            ? request.getReturnUrl()
            : frontendUrl;

        String url = stripeService.createBillingPortalSession(subscription.getStripeCustomerId(), returnUrl);
        return ResponseEntity.ok(ApiResponse.success("Session portail créée", new PortalSessionResponse(url)));
    }
}
