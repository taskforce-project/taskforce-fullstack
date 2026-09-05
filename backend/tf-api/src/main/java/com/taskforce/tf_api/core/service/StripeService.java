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
            .setSuccessUrl(withCheckoutSessionId(successUrl))
            .setCancelUrl(cancelUrl)
            // Affiche le champ « code promo » au checkout (les coupons/promotions se créent côté
            // dashboard Stripe). Sans coupon actif, le champ n'a aucun effet — activation sans risque.
            .setAllowPromotionCodes(true)
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
     * Garantit que l'URL de succès porte le placeholder {@code {CHECKOUT_SESSION_ID}} que Stripe
     * remplace par l'id de session au retour. Sans lui, la page de succès arrive <b>sans</b> {@code
     * session_id} à vérifier → « No payment session found » (bug constaté à l'upgrade). Les pages qui
     * ne lisent pas ce paramètre l'ignorent, donc l'ajout est sûr pour tous les flux.
     */
    static String withCheckoutSessionId(String url) {
        if (url == null || url.contains("{CHECKOUT_SESSION_ID}")) {
            return url;
        }
        return url + (url.contains("?") ? "&" : "?") + "session_id={CHECKOUT_SESSION_ID}";
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
        String id = switch (planType.toUpperCase()) {
            case "BASIC" -> basicPriceId;
            case "BUSINESS" -> businessPriceId;
            case "ENTERPRISE" -> enterprisePriceId;
            default -> throw new IllegalArgumentException("Type de plan invalide : " + planType);
        };
        // Price-id non configuré (STRIPE_PRICE_ID_* absent — cas prod actuel) : message clair (→ 409)
        // au lieu d'un appel Stripe avec un prix vide qui remonte en 502 opaque (« you must provide a price »).
        if (id == null || id.isBlank()) {
            throw new IllegalStateException(
                "Online checkout for the " + planType.toUpperCase() + " plan isn't configured yet. "
                + "Please try again later or contact support.");
        }
        return id;
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
        com.stripe.param.billingportal.SessionCreateParams.Builder params =
            com.stripe.param.billingportal.SessionCreateParams.builder()
                .setCustomer(customerId)
                .setReturnUrl(returnUrl);
        // Active le changement de plan self-service (upgrade/downgrade + proration) quand la config existe.
        String configId = ensurePortalConfiguration();
        if (configId != null) {
            params.setConfiguration(configId);
        }
        com.stripe.model.billingportal.Session session =
            com.stripe.model.billingportal.Session.create(params.build());
        log.info("Session Customer Portal créée pour le client : {}", customerId);
        return session.getUrl();
    }

    /** Id de la config portail mise en cache (créée une fois par cycle de vie du backend). */
    private volatile String portalConfigId;

    /**
     * Crée (ou réutilise) une configuration Customer Portal qui autorise le CHANGEMENT DE PLAN
     * (Basic ⇄ Business) avec proration automatique, en plus de l'annulation et des factures.
     * Sans ça, le portail ne propose QUE « Cancel » et l'utilisateur doit annuler puis re-souscrire.
     * Retourne null si les price-ids ne sont pas configurés (on retombe alors sur la config par défaut).
     */
    private String ensurePortalConfiguration() throws StripeException {
        String cached = portalConfigId;
        if (cached != null) {
            return cached;
        }
        if (basicPriceId == null || basicPriceId.isBlank()
                || businessPriceId == null || businessPriceId.isBlank()) {
            return null;
        }
        synchronized (this) {
            if (portalConfigId != null) {
                return portalConfigId;
            }
            // Produits Stripe déduits de leurs price-ids (le switch se déclare par (produit, prix)).
            String basicProduct = Price.retrieve(basicPriceId).getProduct();
            String businessProduct = Price.retrieve(businessPriceId).getProduct();

            com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionUpdate.Builder subUpdate =
                com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionUpdate.builder()
                    .setEnabled(true)
                    .addDefaultAllowedUpdate(
                        com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionUpdate.DefaultAllowedUpdate.PRICE)
                    .setProrationBehavior(
                        com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionUpdate.ProrationBehavior.CREATE_PRORATIONS);

            if (basicProduct != null && basicProduct.equals(businessProduct)) {
                // Basic et Business sont deux prix d'un même produit : un seul produit, deux prix.
                subUpdate.addProduct(
                    com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product.builder()
                        .setProduct(basicProduct)
                        .addPrice(basicPriceId)
                        .addPrice(businessPriceId)
                        .build());
            } else {
                subUpdate.addProduct(
                    com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product.builder()
                        .setProduct(basicProduct)
                        .addPrice(basicPriceId)
                        .build());
                subUpdate.addProduct(
                    com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product.builder()
                        .setProduct(businessProduct)
                        .addPrice(businessPriceId)
                        .build());
            }

            com.stripe.param.billingportal.ConfigurationCreateParams createParams =
                com.stripe.param.billingportal.ConfigurationCreateParams.builder()
                    .setBusinessProfile(
                        com.stripe.param.billingportal.ConfigurationCreateParams.BusinessProfile.builder()
                            .setHeadline("TaskForce")
                            .build())
                    .setFeatures(
                        com.stripe.param.billingportal.ConfigurationCreateParams.Features.builder()
                            .setSubscriptionUpdate(subUpdate.build())
                            .setSubscriptionCancel(
                                com.stripe.param.billingportal.ConfigurationCreateParams.Features.SubscriptionCancel.builder()
                                    .setEnabled(true)
                                    .build())
                            .setPaymentMethodUpdate(
                                com.stripe.param.billingportal.ConfigurationCreateParams.Features.PaymentMethodUpdate.builder()
                                    .setEnabled(true)
                                    .build())
                            .setInvoiceHistory(
                                com.stripe.param.billingportal.ConfigurationCreateParams.Features.InvoiceHistory.builder()
                                    .setEnabled(true)
                                    .build())
                            .build())
                    .build();

            com.stripe.model.billingportal.Configuration config =
                com.stripe.model.billingportal.Configuration.create(createParams);
            portalConfigId = config.getId();
            log.info("Config Customer Portal créée (switch de plan + proration) : {}", portalConfigId);
            return portalConfigId;
        }
    }

    /**
     * Récupère une session Checkout par son ID
     */
    public Session getCheckoutSession(String sessionId) throws StripeException {
        log.info("Récupération de la session Checkout : {}", sessionId);
        return Session.retrieve(sessionId);
    }
}
