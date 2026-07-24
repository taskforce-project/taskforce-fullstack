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

import com.stripe.exception.EventDataObjectDeserializationException;
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
    private final StripeService stripeService;

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

        // Applique le forfait acheté (metadata posée par BillingController au checkout in-app ;
        // le priceId définitif est re-synchronisé ensuite par customer.subscription.updated).
        PlanType purchased = resolvePlanFromMetadata(session.getMetadata());

        sub.setStatus(PlanStatus.ACTIVE);
        sub.setStripeCustomerId(customerId);
        sub.setStripeSubscriptionId(subscriptionId);
        if (purchased != null) sub.setPlanType(purchased);
        if (sub.getStartedAt() == null) sub.setStartedAt(LocalDateTime.now());
        subscriptionRepository.save(sub);

        // User
        user.setPlanStatus(PlanStatus.ACTIVE);
        user.setStripeSubscriptionId(subscriptionId);
        if (purchased != null) user.setPlanType(purchased);
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

        // Extraire priceId + en déduire le forfait (source de vérité pour synchroniser plan_type).
        PlanType planFromPrice = null;
        if (stripeSub.getItems() != null && stripeSub.getItems().getData() != null
                && !stripeSub.getItems().getData().isEmpty()) {
            var price = stripeSub.getItems().getData().get(0).getPrice();
            if (price != null) {
                sub.setStripePriceId(price.getId());
                planFromPrice = stripeService.getPlanForPriceId(price.getId());
            }
        }
        if (planFromPrice != null) sub.setPlanType(planFromPrice);

        subscriptionRepository.save(sub);

        user.setPlanStatus(newStatus);
        if (planFromPrice != null) user.setPlanType(planFromPrice); // up/down-grade via portail Stripe
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
            sub.setPlanType(PlanType.FREE);
            sub.setCanceledAt(LocalDateTime.now());
            sub.setEndedAt(LocalDateTime.now());
            subscriptionRepository.save(sub);
        });

        // Retour au forfait gratuit à l'annulation de l'abonnement (rétrogradation).
        user.setPlanStatus(PlanStatus.CANCELED);
        user.setPlanType(PlanType.FREE);
        userRepository.save(user);

        recordHistory(user.getId(), event.getId(), event.getType(),
            user.getPlanType(), PlanStatus.CANCELED, stripeSub.getId(), null, null, null, null, null);

        log.info("customer.subscription.deleted traité : userId={}", user.getId());
    }

    /** Déduit le {@link PlanType} depuis la metadata Stripe {@code planType} (posée au checkout in-app). */
    private PlanType resolvePlanFromMetadata(Map<String, String> metadata) {
        if (metadata == null) return null;
        String raw = metadata.get("planType");
        if (raw == null || raw.isBlank()) return null;
        try {
            return PlanType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
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
    /**
     * Extrait l'objet métier d'un événement Stripe, <b>avec repli sur la désérialisation permissive</b>.
     *
     * <p><b>Pourquoi ce repli est indispensable.</b> {@code getObject()} renvoie un {@code Optional}
     * <b>vide</b> dès que la version d'API du compte Stripe diffère de celle que cible la version de
     * {@code stripe-java} embarquée. Sans repli, chaque webhook était alors traité comme un succès
     * vide : la méthode renvoyait {@code null}, le gestionnaire sortait sans rien faire, et le
     * contrôleur répondait <b>200</b>. Stripe considérait donc l'événement comme délivré et ne le
     * rejouait jamais. Aucun abonnement n'était activé, aucun changement de forfait appliqué, aucun
     * échec de paiement enregistré, <b>sans la moindre erreur visible</b>.</p>
     *
     * <p>Constaté le 24/07/2026 en exerçant de vrais événements : compte en
     * {@code 2026-06-24.dahlia}, SDK {@code stripe-java} 31.2.0. <b>Les cinq types d'événements
     * traités échouaient tous.</b></p>
     *
     * <p>{@code deserializeUnsafe()} est le remède documenté par Stripe pour ce cas. Il lit la charge
     * utile sans exiger la concordance de version. Le risque — un champ renommé ou absent dans une
     * version plus récente — est ici acceptable : les gestionnaires ne lisent que des champs stables
     * ({@code id}, {@code customer}, {@code status}, {@code amount_paid}, {@code currency}).</p>
     *
     * <p>Un désaccord de version ne se résout pas en rejouant : l'échec définitif est journalisé en
     * {@code ERROR} et renvoie {@code null} plutôt que de provoquer trois jours de tentatives vaines.</p>
     */
    private <T extends StripeObject> T deserialize(Event event, Class<T> type) {
        EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
        StripeObject obj = deserializer.getObject().orElse(null);

        if (obj == null) {
            try {
                obj = deserializer.deserializeUnsafe();
                log.warn("Désérialisation de secours pour l'événement {} : la version d'API du compte "
                    + "Stripe diffère de celle ciblée par stripe-java. Traitement poursuivi.", event.getId());
            } catch (EventDataObjectDeserializationException e) {
                log.error("Impossible de désérialiser l'objet Stripe pour l'événement {} : {}",
                    event.getId(), e.getMessage());
                return null;
            }
        }
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
