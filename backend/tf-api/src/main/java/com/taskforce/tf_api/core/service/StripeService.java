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

    @Value("${stripe.plans.premium.price-id}")
    private String premiumPriceId;

    @Value("${stripe.plans.enterprise.price-id}")
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

    /**
     * Crée une session de paiement Checkout Stripe
     */
    public Session createCheckoutSession(
        String customerId,
        String priceId,
        String successUrl,
        String cancelUrl,
        Map<String, String> metadata
    ) throws StripeException {
        log.info("Création d'une session Checkout Stripe pour le client : {}", customerId);

        SessionCreateParams.Builder paramsBuilder = SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
            .setCustomer(customerId)
            .setSuccessUrl(successUrl)
            .setCancelUrl(cancelUrl)
            .addLineItem(
                SessionCreateParams.LineItem.builder()
                    .setPrice(priceId)
                    .setQuantity(1L)
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
            case "PREMIUM" -> premiumPriceId;
            case "ENTERPRISE" -> enterprisePriceId;
            default -> throw new IllegalArgumentException("Type de plan invalide : " + planType);
        };
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
     * Récupère une session Checkout par son ID
     */
    public Session getCheckoutSession(String sessionId) throws StripeException {
        log.info("Récupération de la session Checkout : {}", sessionId);
        return Session.retrieve(sessionId);
    }
}
