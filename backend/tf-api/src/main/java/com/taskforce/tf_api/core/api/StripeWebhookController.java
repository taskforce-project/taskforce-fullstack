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
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Contrôleur pour gérer les webhooks Stripe
 * Reçoit les notifications d'événements de Stripe (paiements, abonnements, etc.)
 */
@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
@Slf4j
public class StripeWebhookController {

    @Value("${stripe.webhook-secret}")
    private String webhookSecret;

    private final UserRepository userRepository;

    /**
     * Endpoint webhook Stripe
     * Reçoit tous les événements configurés dans Stripe Dashboard
     */
    @PostMapping("/stripe")
    public ResponseEntity<String> handleStripeWebhook(
        @RequestBody String payload,
        @RequestHeader("Stripe-Signature") String sigHeader
    ) {
        log.info("Réception d'un webhook Stripe");

        Event event;

        try {
            // Vérifier la signature du webhook pour s'assurer qu'il vient bien de Stripe
            event = Webhook.constructEvent(payload, sigHeader, webhookSecret);
            log.info("Webhook Stripe vérifié avec succès. Type d'événement : {}", event.getType());
        } catch (SignatureVerificationException e) {
            log.error("Échec de la vérification de la signature du webhook Stripe : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid signature");
        } catch (Exception e) {
            log.error("Erreur lors du traitement du webhook Stripe : {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Webhook error: " + e.getMessage());
        }

        // Traiter l'événement selon son type
        switch (event.getType()) {
            case "checkout.session.completed":
                handleCheckoutSessionCompleted(event);
                break;
            case "customer.subscription.updated":
                handleSubscriptionUpdated(event);
                break;
            case "customer.subscription.deleted":
                handleSubscriptionDeleted(event);
                break;
            case "invoice.payment_succeeded":
                handleInvoicePaymentSucceeded(event);
                break;
            case "invoice.payment_failed":
                handleInvoicePaymentFailed(event);
                break;
            default:
                log.info("Type d'événement non géré : {}", event.getType());
        }

        return ResponseEntity.ok("Webhook received");
    }

    /**
     * Gère l'événement checkout.session.completed
     * Déclenché quand un utilisateur complète avec succès le paiement Stripe Checkout
     */
    private void handleCheckoutSessionCompleted(Event event) {
        try {
            EventDataObjectDeserializer dataObjectDeserializer = event.getDataObjectDeserializer();
            StripeObject stripeObject = null;
            
            if (dataObjectDeserializer.getObject().isPresent()) {
                stripeObject = dataObjectDeserializer.getObject().get();
            }

            if (stripeObject instanceof Session session) {
                String customerEmail = session.getCustomerEmail();
                String customerId = session.getCustomer();
                String subscriptionId = session.getSubscription();

                log.info("Checkout Session complété pour : {} (Customer ID: {}, Subscription ID: {})", 
                    customerEmail, customerId, subscriptionId);

                // Mettre à jour l'utilisateur dans la DB : plan_status = ACTIVE
                userRepository.findByEmail(customerEmail).ifPresent(user -> {
                    user.setPlanStatus(PlanStatus.ACTIVE);
                    user.setStripeSubscriptionId(subscriptionId);
                    userRepository.save(user);
                    log.info("Utilisateur {} mis à jour : plan_status = ACTIVE", customerEmail);
                });
            }
        } catch (Exception e) {
            log.error("Erreur lors du traitement de checkout.session.completed : {}", e.getMessage(), e);
        }
    }

    /**
     * Gère l'événement customer.subscription.updated
     * Déclenché quand un abonnement est modifié (changement de plan, etc.)
     */
    private void handleSubscriptionUpdated(Event event) {
        log.info("Abonnement mis à jour");
        // À implémenter : Gérer les changements d'abonnement
    }

    /**
     * Gère l'événement customer.subscription.deleted
     * Déclenché quand un abonnement est annulé
     */
    private void handleSubscriptionDeleted(Event event) {
        log.info("Abonnement annulé");
        // À implémenter : Passer l'utilisateur en FREE ou CANCELED
    }

    /**
     * Gère l'événement invoice.payment_succeeded
     * Déclenché à chaque renouvellement mensuel réussi
     */
    private void handleInvoicePaymentSucceeded(Event event) {
        log.info("Paiement de facture réussi (renouvellement)");
        // À implémenter : Logger le paiement, prolonger l'accès
    }

    /**
     * Gère l'événement invoice.payment_failed
     * Déclenché quand un paiement échoue (carte expirée, fonds insuffisants, etc.)
     */
    private void handleInvoicePaymentFailed(Event event) {
        log.error("Échec de paiement de facture");
        // À implémenter : Notifier l'utilisateur, suspendre l'accès après X échecs
    }
}
