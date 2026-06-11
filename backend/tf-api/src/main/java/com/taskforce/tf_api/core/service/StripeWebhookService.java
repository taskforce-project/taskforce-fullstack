package com.taskforce.tf_api.core.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.Invoice;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.Subscription;
import com.taskforce.tf_api.core.model.SubscriptionHistory;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.SubscriptionHistoryRepository;
import com.taskforce.tf_api.core.repository.SubscriptionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Logique métier des webhooks Stripe.
 * Chaque handler est idempotent : un event Stripe déjà traité (même stripeEventId) est ignoré.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class StripeWebhookService {

    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionHistoryRepository subscriptionHistoryRepository;

    // =========================================================================
    // Handlers publics
    // =========================================================================

    @Transactional
    public void handleCheckoutSessionCompleted(Event event) {
        if (alreadyProcessed(event.getId())) return;

        Session session = deserialize(event, Session.class);
        if (session == null) return;

        String customerId      = session.getCustomer();
        String subscriptionId  = session.getSubscription();
        String customerEmail   = session.getCustomerEmail();

        // Résoudre l'utilisateur
        Optional<User> userOpt = customerId != null
            ? userRepository.findByStripeCustomerId(customerId)
            : (customerEmail != null ? userRepository.findByEmail(customerEmail) : Optional.empty());

        if (userOpt.isEmpty()) {
            log.warn("checkout.session.completed : aucun utilisateur trouvé pour customerId={} email={}", customerId, customerEmail);
            return;
        }
        User user = userOpt.get();

        // Upsert Subscription (les détails complets arrivent via customer.subscription.updated)
        Subscription sub = subscriptionRepository.findByUserId(user.getId())
            .orElseGet(() -> Subscription.builder().userId(user.getId()).build());

        sub.setStatus(PlanStatus.ACTIVE);
        sub.setStripeCustomerId(customerId);
        sub.setStripeSubscriptionId(subscriptionId);
        if (sub.getStartedAt() == null) sub.setStartedAt(LocalDateTime.now());
        subscriptionRepository.save(sub);

        // User
        user.setPlanStatus(PlanStatus.ACTIVE);
        user.setStripeSubscriptionId(subscriptionId);
        userRepository.save(user);

        recordHistory(user.getId(), event.getId(), event.getType(),
            sub.getPlanType(), PlanStatus.ACTIVE, subscriptionId, null, null, null, null, null);

        log.info("checkout.session.completed traité : userId={} subscriptionId={}", user.getId(), subscriptionId);
    }

    @Transactional
    public void handleSubscriptionUpdated(Event event) {
        if (alreadyProcessed(event.getId())) return;

        com.stripe.model.Subscription stripeSub = deserialize(event, com.stripe.model.Subscription.class);
        if (stripeSub == null) return;

        String subscriptionId = stripeSub.getId();
        String customerId     = stripeSub.getCustomer();
        PlanStatus newStatus  = mapStripeStatus(stripeSub.getStatus());

        Optional<User> userOpt = userRepository.findByStripeCustomerId(customerId);
        if (userOpt.isEmpty()) {
            log.warn("customer.subscription.updated : aucun utilisateur pour customerId={}", customerId);
            return;
        }
        User user = userOpt.get();

        Subscription sub = subscriptionRepository.findByUserId(user.getId())
            .orElseGet(() -> Subscription.builder().userId(user.getId()).build());

        sub.setStatus(newStatus);
        sub.setStripeSubscriptionId(subscriptionId);
        sub.setStripeCustomerId(customerId);
        sub.setCurrentPeriodStart(null);
        sub.setCurrentPeriodEnd(null);
        sub.setCancelAtPeriodEnd(Boolean.TRUE.equals(stripeSub.getCancelAtPeriodEnd()));
        sub.setCanceledAt(fromUnix(stripeSub.getCanceledAt()));
        sub.setTrialEnd(fromUnix(stripeSub.getTrialEnd()));

        // Extraire priceId depuis les items de l'abonnement
        if (stripeSub.getItems() != null && stripeSub.getItems().getData() != null
                && !stripeSub.getItems().getData().isEmpty()) {
            var price = stripeSub.getItems().getData().get(0).getPrice();
            if (price != null) sub.setStripePriceId(price.getId());
        }

        subscriptionRepository.save(sub);

        user.setPlanStatus(newStatus);
        userRepository.save(user);

        recordHistory(user.getId(), event.getId(), event.getType(),
            sub.getPlanType(), newStatus, subscriptionId, null, null, null,
            null, null);

        log.info("customer.subscription.updated traité : userId={} status={}", user.getId(), newStatus);
    }

    @Transactional
    public void handleSubscriptionDeleted(Event event) {
        if (alreadyProcessed(event.getId())) return;

        com.stripe.model.Subscription stripeSub = deserialize(event, com.stripe.model.Subscription.class);
        if (stripeSub == null) return;

        String customerId = stripeSub.getCustomer();

        Optional<User> userOpt = userRepository.findByStripeCustomerId(customerId);
        if (userOpt.isEmpty()) {
            log.warn("customer.subscription.deleted : aucun utilisateur pour customerId={}", customerId);
            return;
        }
        User user = userOpt.get();

        subscriptionRepository.findByUserId(user.getId()).ifPresent(sub -> {
            sub.setStatus(PlanStatus.CANCELED);
            sub.setCanceledAt(LocalDateTime.now());
            sub.setEndedAt(LocalDateTime.now());
            subscriptionRepository.save(sub);
        });

        user.setPlanStatus(PlanStatus.CANCELED);
        userRepository.save(user);

        recordHistory(user.getId(), event.getId(), event.getType(),
            user.getPlanType(), PlanStatus.CANCELED, stripeSub.getId(), null, null, null, null, null);

        log.info("customer.subscription.deleted traité : userId={}", user.getId());
    }

    @Transactional
    public void handleInvoicePaymentSucceeded(Event event) {
        if (alreadyProcessed(event.getId())) return;

        Invoice invoice = deserialize(event, Invoice.class);
        if (invoice == null) return;

        String customerId     = invoice.getCustomer();
        String subscriptionId = (invoice.getParent() != null
            && invoice.getParent().getSubscriptionDetails() != null)
            ? invoice.getParent().getSubscriptionDetails().getSubscription()
            : null;
        String invoiceId      = invoice.getId();
        BigDecimal amount     = invoice.getAmountPaid() != null
            ? BigDecimal.valueOf(invoice.getAmountPaid()).divide(BigDecimal.valueOf(100))
            : null;
        String currency = invoice.getCurrency();

        Optional<User> userOpt = userRepository.findByStripeCustomerId(customerId);
        if (userOpt.isEmpty()) {
            log.warn("invoice.payment_succeeded : aucun utilisateur pour customerId={}", customerId);
            return;
        }
        User user = userOpt.get();

        // S'assurer que le statut est ACTIVE après un paiement réussi
        subscriptionRepository.findByUserId(user.getId()).ifPresent(sub -> {
            if (sub.getStatus() != PlanStatus.ACTIVE) {
                sub.setStatus(PlanStatus.ACTIVE);
                subscriptionRepository.save(sub);
            }
        });

        if (user.getPlanStatus() != PlanStatus.ACTIVE) {
            user.setPlanStatus(PlanStatus.ACTIVE);
            userRepository.save(user);
        }

        recordHistory(user.getId(), event.getId(), event.getType(),
            user.getPlanType(), PlanStatus.ACTIVE, subscriptionId, invoiceId, amount, currency, null, null);

        log.info("invoice.payment_succeeded traité : userId={} montant={}{}", user.getId(), amount, currency);
    }

    @Transactional
    public void handleInvoicePaymentFailed(Event event) {
        if (alreadyProcessed(event.getId())) return;

        Invoice invoice = deserialize(event, Invoice.class);
        if (invoice == null) return;

        String customerId     = invoice.getCustomer();
        String subscriptionId = (invoice.getParent() != null
            && invoice.getParent().getSubscriptionDetails() != null)
            ? invoice.getParent().getSubscriptionDetails().getSubscription()
            : null;
        String invoiceId      = invoice.getId();

        Optional<User> userOpt = userRepository.findByStripeCustomerId(customerId);
        if (userOpt.isEmpty()) {
            log.warn("invoice.payment_failed : aucun utilisateur pour customerId={}", customerId);
            return;
        }
        User user = userOpt.get();

        subscriptionRepository.findByUserId(user.getId()).ifPresent(sub -> {
            sub.setStatus(PlanStatus.PAST_DUE);
            subscriptionRepository.save(sub);
        });

        user.setPlanStatus(PlanStatus.PAST_DUE);
        userRepository.save(user);

        recordHistory(user.getId(), event.getId(), event.getType(),
            user.getPlanType(), PlanStatus.PAST_DUE, subscriptionId, invoiceId, null, null, null, null);

        log.warn("invoice.payment_failed traité : userId={} — statut PAST_DUE", user.getId());
    }

    // =========================================================================
    // Helpers privés
    // =========================================================================

    private boolean alreadyProcessed(String stripeEventId) {
        if (subscriptionHistoryRepository.existsByStripeEventId(stripeEventId)) {
            log.info("Événement Stripe {} déjà traité — ignoré (idempotence)", stripeEventId);
            return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private <T extends StripeObject> T deserialize(Event event, Class<T> type) {
        EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
        if (!deserializer.getObject().isPresent()) {
            log.warn("Impossible de désérialiser l'objet Stripe pour l'événement {}", event.getId());
            return null;
        }
        StripeObject obj = deserializer.getObject().get();
        if (!type.isInstance(obj)) {
            log.warn("Type inattendu pour {}: attendu {}, reçu {}", event.getId(), type.getSimpleName(), obj.getClass().getSimpleName());
            return null;
        }
        return type.cast(obj);
    }

    private void recordHistory(Long userId, String stripeEventId, String eventType,
                               PlanType planType, PlanStatus planStatus,
                               String stripeSubscriptionId, String stripeInvoiceId,
                               BigDecimal amountPaid, String currency,
                               LocalDateTime periodStart, LocalDateTime periodEnd) {
        Map<String, Object> eventData = new HashMap<>();
        if (stripeSubscriptionId != null) eventData.put("subscriptionId", stripeSubscriptionId);
        if (stripeInvoiceId != null)      eventData.put("invoiceId", stripeInvoiceId);

        SubscriptionHistory history = SubscriptionHistory.builder()
            .userId(userId)
            .stripeEventId(stripeEventId)
            .eventType(eventType)
            .planType(planType != null ? planType : PlanType.FREE)
            .planStatus(planStatus)
            .stripeSubscriptionId(stripeSubscriptionId)
            .stripeInvoiceId(stripeInvoiceId)
            .amountPaid(amountPaid)
            .currency(currency != null ? currency : "EUR")
            .periodStart(periodStart)
            .periodEnd(periodEnd)
            .eventData(eventData)
            .build();

        subscriptionHistoryRepository.save(history);
    }

    private PlanStatus mapStripeStatus(String stripeStatus) {
        if (stripeStatus == null) return PlanStatus.ACTIVE;
        return switch (stripeStatus) {
            case "active"              -> PlanStatus.ACTIVE;
            case "trialing"            -> PlanStatus.TRIALING;
            case "canceled"            -> PlanStatus.CANCELED;
            case "past_due"            -> PlanStatus.PAST_DUE;
            case "incomplete"          -> PlanStatus.INCOMPLETE;
            case "incomplete_expired"  -> PlanStatus.INCOMPLETE_EXPIRED;
            case "unpaid"              -> PlanStatus.UNPAID;
            default -> {
                log.warn("Statut Stripe inconnu : {} — fallback ACTIVE", stripeStatus);
                yield PlanStatus.ACTIVE;
            }
        };
    }

    private LocalDateTime fromUnix(Long epochSeconds) {
        if (epochSeconds == null) return null;
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC);
    }
}
