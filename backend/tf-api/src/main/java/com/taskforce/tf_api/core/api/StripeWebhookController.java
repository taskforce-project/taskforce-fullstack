package com.taskforce.tf_api.core.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.net.Webhook;
import com.taskforce.tf_api.core.service.StripeWebhookService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Reçoit les webhooks Stripe, vérifie la signature, délègue au StripeWebhookService.
 */
@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
@Slf4j
public class StripeWebhookController {

    @Value("${stripe.webhook-secret}")
    private String webhookSecret;

    private final StripeWebhookService stripeWebhookService;

    @PostMapping("/stripe")
    public ResponseEntity<String> handleStripeWebhook(
        @RequestBody String payload,
        @RequestHeader("Stripe-Signature") String sigHeader
    ) {
        log.info("Réception d'un webhook Stripe");

        Event event;
        try {
            event = Webhook.constructEvent(payload, sigHeader, webhookSecret);
            log.info("Webhook Stripe vérifié. Type : {}, ID : {}", event.getType(), event.getId());
        } catch (SignatureVerificationException e) {
            log.error("Signature Stripe invalide : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid signature");
        } catch (Exception e) {
            log.error("Erreur lors de la construction du webhook : {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Webhook error: " + e.getMessage());
        }

        try {
            switch (event.getType()) {
                case "checkout.session.completed"    -> stripeWebhookService.handleCheckoutSessionCompleted(event);
                case "customer.subscription.updated" -> stripeWebhookService.handleSubscriptionUpdated(event);
                case "customer.subscription.deleted" -> stripeWebhookService.handleSubscriptionDeleted(event);
                case "invoice.payment_succeeded"     -> stripeWebhookService.handleInvoicePaymentSucceeded(event);
                case "invoice.payment_failed"        -> stripeWebhookService.handleInvoicePaymentFailed(event);
                default -> log.info("Type d'événement non géré : {}", event.getType());
            }
        } catch (Exception e) {
            log.error("Erreur lors du traitement du webhook {} : {}", event.getType(), e.getMessage(), e);
            // On retourne 200 pour éviter que Stripe rétente indéfiniment sur une erreur applicative
            return ResponseEntity.ok("Webhook received with processing error");
        }

        return ResponseEntity.ok("Webhook received");
    }
}
