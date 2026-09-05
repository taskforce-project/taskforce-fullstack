package com.taskforce.tf_api.core.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
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
import com.taskforce.tf_api.core.model.User;
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

        // Le client Stripe est porté par la table `users` (rempli par le webhook au 1er paiement), et
        // NON par une entité Subscription dédiée (souvent absente : 0 ligne même pour un compte payant).
        // Lire `subscriptions` ici renvoyait "plan gratuit" à tort → portail / downgrade cassés. On
        // source donc le customer depuis l'utilisateur. (`cus_seed_*` = seed factice → traité comme absent.)
        String customerId = user.getStripeCustomerId();
        if (customerId == null || customerId.isBlank() || customerId.startsWith("cus_seed")) {
            throw new IllegalStateException(
                "Aucun abonnement à gérer (plan gratuit). Souscrivez d'abord à un plan payant.");
        }

        String returnUrl = (request != null && request.getReturnUrl() != null && !request.getReturnUrl().isBlank())
            ? request.getReturnUrl()
            : frontendUrl;

        String url = stripeService.createBillingPortalSession(customerId, returnUrl);
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
        // Les identifiants de seed (`cus_seed_*`) sont factices → n'existent pas dans le vrai compte
        // Stripe ; on les traite comme absents pour créer un client réel (sinon "No such customer").
        String existingCustomer = user.getStripeCustomerId();
        String customerId;
        if (existingCustomer != null && !existingCustomer.isBlank() && !existingCustomer.startsWith("cus_seed")) {
            customerId = existingCustomer;
        } else {
            try {
                customerId = stripeService.createCustomer(user.getEmail(), user.getDisplayName()).getId();
            } catch (StripeException e) {
                throw new IllegalStateException("Client Stripe indisponible : " + e.getMessage(), e);
            }
        }

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

    /**
     * Erreur du fournisseur de paiement (Stripe : clé absente/invalide, API en échec…) → renvoie un
     * <b>502</b> propre avec un message actionnable, au lieu du 500 générique du handler global. Sans ça,
     * un clic « Passer à… » / « Gérer » avec Stripe mal configuré remontait en 500 (page Billing).
     */
    @ExceptionHandler(StripeException.class)
    public ResponseEntity<ApiResponse<Void>> handleStripe(StripeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
            .body(ApiResponse.error("Service de paiement momentanément indisponible. Réessayez plus tard."));
    }
}
