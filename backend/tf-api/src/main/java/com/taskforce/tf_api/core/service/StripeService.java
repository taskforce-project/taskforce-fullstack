package com.taskforce.tf_api.core.service;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.stripe.model.Price;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.checkout.SessionCreateParams;
import com.taskforce.tf_api.core.enums.PlanType;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;

/**
 * Service pour communiquer avec l'API Stripe
 * L'API Java gère toutes les interactions avec Stripe, pas le frontend
 */
@Service
@Slf4j
public class StripeService {

    @Value("${stripe.api-key}")
    private String stripeSecretKey;

    @Value("${stripe.plans.basic.price-id:}")
    private String basicPriceId;

    @Value("${stripe.plans.business.price-id:}")
    private String businessPriceId;

    @Value("${stripe.plans.enterprise.price-id:}")
    private String enterprisePriceId;

    @PostConstruct
    public void init() {
        Stripe.apiKey = stripeSecretKey;
        log.info("Stripe API initialisée avec succès");
    }

    /**
     * Crée un client Stripe
     */
    public Customer createCustomer(String email, String name) throws StripeException {
        log.info("Création d'un client Stripe pour : {}", email);

        CustomerCreateParams params = CustomerCreateParams.builder()
            .setEmail(email)
            .setName(name)
            .build();

        Customer customer = Customer.create(params);
        log.info("Client Stripe créé avec ID : {}", customer.getId());
        return customer;
    }

    /** Session Checkout à 1 siège (compat — inscription). */
    public Session createCheckoutSession(
        String customerId,
        String priceId,
        String successUrl,
        String cancelUrl,
        Map<String, String> metadata
    ) throws StripeException {
        return createCheckoutSession(customerId, priceId, 1L, successUrl, cancelUrl, metadata);
    }

    /**
     * Crée une session de paiement Checkout Stripe pour {@code quantity} sièges (tarification par membre).
     */
    public Session createCheckoutSession(
        String customerId,
        String priceId,
        long quantity,
        String successUrl,
        String cancelUrl,
        Map<String, String> metadata
    ) throws StripeException {
        log.info("Création d'une session Checkout Stripe pour le client {} ({} siège(s))", customerId, quantity);

        SessionCreateParams.Builder paramsBuilder = SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
            .setCustomer(customerId)
            .setSuccessUrl(successUrl)
            .setCancelUrl(cancelUrl)
            .addLineItem(
                SessionCreateParams.LineItem.builder()
                    .setPrice(priceId)
                    .setQuantity(Math.max(1L, quantity))
                    .build()
            );

        // Ajouter les métadonnées si présentes
        if (metadata != null && !metadata.isEmpty()) {
            paramsBuilder.putAllMetadata(metadata);
        }

        Session session = Session.create(paramsBuilder.build());
        log.info("Session Checkout créée avec ID : {}", session.getId());
        return session;
    }

    /**
     * Récupère un abonnement Stripe par son ID
     */
    public Subscription getSubscription(String subscriptionId) throws StripeException {
        log.info("Récupération de l'abonnement Stripe : {}", subscriptionId);
        return Subscription.retrieve(subscriptionId);
    }

    /**
     * Annule un abonnement Stripe
     */
    public Subscription cancelSubscription(String subscriptionId, boolean immediately) throws StripeException {
        log.info("Annulation de l'abonnement Stripe : {} (immédiat: {})", subscriptionId, immediately);

        Subscription subscription = Subscription.retrieve(subscriptionId);

        if (immediately) {
            // Annulation immédiate
            return subscription.cancel();
        } else {
            // Annulation à la fin de la période de facturation
            Map<String, Object> params = new HashMap<>();
            params.put("cancel_at_period_end", true);
            return subscription.update(params);
        }
    }

    /**
     * Récupère le Price ID selon le type de plan
     */
    public String getPriceIdForPlan(String planType) {
        return switch (planType.toUpperCase()) {
            case "BASIC" -> basicPriceId;
            case "BUSINESS" -> businessPriceId;
            case "ENTERPRISE" -> enterprisePriceId;
            default -> throw new IllegalArgumentException("Type de plan invalide : " + planType);
        };
    }

    /**
     * Reverse de {@link #getPriceIdForPlan} : déduit le {@link PlanType} depuis un price-id Stripe.
     * Renvoie {@code null} si le prix ne correspond à aucun forfait configuré (source de vérité pour
     * synchroniser {@code User.planType} depuis les webhooks {@code customer.subscription.*}).
     */
    public PlanType getPlanForPriceId(String priceId) {
        if (priceId == null || priceId.isBlank()) return null;
        // Un même price-id peut être MAL configuré pour plusieurs forfaits (ex. STRIPE_PRICE_ID_BASIC ==
        // STRIPE_PRICE_ID_BUSINESS). Dans ce cas le reverse-mapping est AMBIGU : on renvoie null pour NE
        // PAS resynchroniser le plan depuis un signal non fiable — surtout ne pas RÉTROGRADER un Business
        // en Basic sur `customer.subscription.updated`. Le plan fiable reste celui posé par
        // `checkout.session.completed` (metadata `planType`). Cf. audit-livrable-pfr.md §2.
        int matches = 0;
        PlanType result = null;
        if (priceId.equals(basicPriceId))      { matches++; result = PlanType.BASIC; }
        if (priceId.equals(businessPriceId))   { matches++; result = PlanType.BUSINESS; }
        if (priceId.equals(enterprisePriceId)) { matches++; result = PlanType.ENTERPRISE; }
        return matches == 1 ? result : null;
    }

    /**
     * Récupère les détails d'un prix Stripe
     */
    public Price getPrice(String priceId) throws StripeException {
        log.info("Récupération du prix Stripe : {}", priceId);
        return Price.retrieve(priceId);
    }

    /**
     * Récupère un client Stripe par son ID
     */
    public Customer getCustomer(String customerId) throws StripeException {
        log.info("Récupération du client Stripe : {}", customerId);
        return Customer.retrieve(customerId);
    }

    /**
     * Récupère un client Stripe (alias de getCustomer pour cohérence)
     */
    public Customer retrieveCustomer(String customerId) throws StripeException {
        return getCustomer(customerId);
    }

    /**
     * Crée une session Stripe Customer Portal (gestion self-service de l'abonnement + factures).
     * PROD-4.5. Retourne l'URL de redirection.
     */
    public String createBillingPortalSession(String customerId, String returnUrl) throws StripeException {
        com.stripe.param.billingportal.SessionCreateParams params =
            com.stripe.param.billingportal.SessionCreateParams.builder()
                .setCustomer(customerId)
                .setReturnUrl(returnUrl)
                .build();
        com.stripe.model.billingportal.Session session =
            com.stripe.model.billingportal.Session.create(params);
        log.info("Session Customer Portal créée pour le client : {}", customerId);
        return session.getUrl();
    }

    /**
     * Récupère une session Checkout par son ID
     */
    public Session getCheckoutSession(String sessionId) throws StripeException {
        log.info("Récupération de la session Checkout : {}", sessionId);
        return Session.retrieve(sessionId);
    }
}
