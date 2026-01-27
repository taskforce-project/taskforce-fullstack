package com.taskforce.tf_api.shared.config;

import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration Stripe
 * Gestion des paiements et abonnements
 */
@Slf4j
@Getter
@Configuration
public class StripeConfig {

    @Value("${stripe.api-key}")
    private String apiKey;

    @Value("${stripe.webhook-secret}")
    private String webhookSecret;

    @Value("${stripe.plans.free.price-id:#{null}}")
    private String freePriceId;

    @Value("${stripe.plans.premium.price-id}")
    private String premiumPriceId;

    @Value("${stripe.plans.enterprise.price-id}")
    private String enterprisePriceId;

    /**
     * Initialisation de Stripe avec la clé API
     */
    @PostConstruct
    public void init() {
        Stripe.apiKey = apiKey;
        log.info("Stripe API initialized - Webhook secret configured: {}",
                webhookSecret != null && !webhookSecret.isEmpty());
        log.info("Stripe Plans configured - Premium: {}, Enterprise: {}",
                premiumPriceId != null, enterprisePriceId != null);
    }
}
