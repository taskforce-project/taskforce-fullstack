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
import com.stripe.model.checkout.Session;
import com.taskforce.tf_api.core.dto.request.CreateCheckoutSessionRequest;
import com.taskforce.tf_api.core.dto.request.PortalSessionRequest;
import com.taskforce.tf_api.core.dto.response.CheckoutSessionResponse;
import com.taskforce.tf_api.core.dto.response.PortalSessionResponse;
import com.taskforce.tf_api.core.dto.response.SubscriptionInfoResponse;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.Subscription;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.SubscriptionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.StripeService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
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
    private final WorkspaceMemberRepository workspaceMemberRepository;

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

    /**
     * Crée une session Stripe Checkout pour un **upgrade in-app** (utilisateur authentifié).
     * Tarification **par siège** : la quantité = nombre de membres distincts sur les workspaces du
     * compte. Réservé aux forfaits souscriptibles en ligne (BASIC, BUSINESS) — ENTERPRISE = contact.
     */
    @PostMapping("/checkout")
    public ResponseEntity<ApiResponse<CheckoutSessionResponse>> createCheckout(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody CreateCheckoutSessionRequest body
    ) throws StripeException {
        User user = userRepository.findByEmail(jwt.getClaimAsString("email"))
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        String plan = body.getPlanType() == null ? "" : body.getPlanType().toUpperCase();
        if (!plan.equals("BASIC") && !plan.equals("BUSINESS")) {
            throw new IllegalArgumentException("Ce forfait n'est pas souscriptible en ligne : " + plan);
        }
        String priceId = stripeService.getPriceIdForPlan(plan);

        // Sièges facturés = membres distincts sur les workspaces du compte (min 1).
        long seats = Math.max(1L, workspaceMemberRepository.countDistinctMembersByOwnerId(user.getId()));

        // Réutilise le client Stripe existant, sinon en crée un.
        String customerId = subscriptionRepository.findByUserId(user.getId())
            .map(Subscription::getStripeCustomerId)
            .filter(id -> id != null && !id.isBlank())
            .orElseGet(() -> {
                try {
                    return stripeService.createCustomer(user.getEmail(), user.getDisplayName()).getId();
                } catch (StripeException e) {
                    throw new IllegalStateException("Client Stripe indisponible : " + e.getMessage(), e);
                }
            });

        String success = notBlank(body.getSuccessUrl()) ? body.getSuccessUrl() : frontendUrl + "/payment/success";
        String cancel  = notBlank(body.getCancelUrl())  ? body.getCancelUrl()  : frontendUrl + "/payment/cancel";

        Session session = stripeService.createCheckoutSession(
            customerId, priceId, seats, success, cancel,
            java.util.Map.of("userId", String.valueOf(user.getId()), "planType", plan, "seats", String.valueOf(seats)));

        return ResponseEntity.ok(ApiResponse.success("Session de paiement créée",
            CheckoutSessionResponse.builder()
                .sessionId(session.getId())
                .sessionUrl(session.getUrl())
                .status("created")
                .build()));
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
