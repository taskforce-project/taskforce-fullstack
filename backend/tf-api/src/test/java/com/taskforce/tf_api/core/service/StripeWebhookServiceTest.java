package com.taskforce.tf_api.core.service;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.Invoice;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.model.Subscription;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.SubscriptionHistoryRepository;
import com.taskforce.tf_api.core.repository.SubscriptionRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires (paiement, priorité critique) — {@link StripeWebhookService}.
 * Handlers d'événements Stripe (checkout/subscription/invoice) : idempotence, résolution user,
 * upsert de l'abonnement + statut. Objets Stripe (Event/Session/Subscription/Invoice) mockés.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("StripeWebhookService")
class StripeWebhookServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private SubscriptionRepository subscriptionRepository;
    @Mock private SubscriptionHistoryRepository subscriptionHistoryRepository;

    @InjectMocks private StripeWebhookService service;

    private Event eventReturning(StripeObject obj, String id, String type) {
        Event e = mock(Event.class);
        when(e.getId()).thenReturn(id);
        lenient().when(e.getType()).thenReturn(type);
        EventDataObjectDeserializer d = mock(EventDataObjectDeserializer.class);
        when(e.getDataObjectDeserializer()).thenReturn(d);
        when(d.getObject()).thenReturn(Optional.of(obj));
        lenient().when(subscriptionHistoryRepository.existsByStripeEventId(id)).thenReturn(false);
        return e;
    }

    private User user() {
        return User.builder().id(7L).email("pay@it.dev").planType(com.taskforce.tf_api.core.enums.PlanType.BUSINESS).build();
    }

    // =========================================================================
    @Nested
    @DisplayName("checkout.session.completed")
    class Checkout {

        private Session session() {
            Session s = mock(Session.class);
            when(s.getCustomer()).thenReturn("cus_1");
            lenient().when(s.getSubscription()).thenReturn("sub_1");
            lenient().when(s.getCustomerEmail()).thenReturn("pay@it.dev");
            return s;
        }

        @Test
        @DisplayName("active l'abonnement et l'utilisateur")
        void activates_subscription() {
            User u = user();
            when(userRepository.findByStripeCustomerId("cus_1")).thenReturn(Optional.of(u));
            when(subscriptionRepository.findByUserId(7L)).thenReturn(Optional.empty());

            service.handleCheckoutSessionCompleted(eventReturning(session(), "evt_1", "checkout.session.completed"));

            verify(subscriptionRepository).save(any(Subscription.class));
            verify(userRepository).save(u);
            assertThat(u.getPlanStatus()).isEqualTo(PlanStatus.ACTIVE);
        }

        @Test
        @DisplayName("idempotent : un événement déjà traité est ignoré")
        void idempotent() {
            Event e = mock(Event.class);
            when(e.getId()).thenReturn("evt_dup");
            when(subscriptionHistoryRepository.existsByStripeEventId("evt_dup")).thenReturn(true);

            service.handleCheckoutSessionCompleted(e);

            verify(subscriptionRepository, never()).save(any());
        }

        @Test
        @DisplayName("utilisateur introuvable → aucune écriture")
        void user_not_found() {
            when(userRepository.findByStripeCustomerId("cus_1")).thenReturn(Optional.empty());

            service.handleCheckoutSessionCompleted(eventReturning(session(), "evt_2", "checkout.session.completed"));

            verify(subscriptionRepository, never()).save(any());
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("subscription updated / deleted")
    class Subscriptions {

        @Test
        @DisplayName("subscription.updated mappe le statut et met à jour")
        void updated() {
            com.stripe.model.Subscription stripeSub = mock(com.stripe.model.Subscription.class);
            when(stripeSub.getId()).thenReturn("sub_1");
            when(stripeSub.getCustomer()).thenReturn("cus_1");
            when(stripeSub.getStatus()).thenReturn("active");
            lenient().when(stripeSub.getCancelAtPeriodEnd()).thenReturn(false);
            lenient().when(stripeSub.getItems()).thenReturn(null);
            User u = user();
            when(userRepository.findByStripeCustomerId("cus_1")).thenReturn(Optional.of(u));
            when(subscriptionRepository.findByUserId(7L)).thenReturn(Optional.empty());

            service.handleSubscriptionUpdated(eventReturning(stripeSub, "evt_3", "customer.subscription.updated"));

            verify(subscriptionRepository).save(any());
            verify(userRepository).save(u);
        }

        @Test
        @DisplayName("subscription.deleted passe l'utilisateur en CANCELED")
        void deleted() {
            com.stripe.model.Subscription stripeSub = mock(com.stripe.model.Subscription.class);
            when(stripeSub.getCustomer()).thenReturn("cus_1");
            lenient().when(stripeSub.getId()).thenReturn("sub_1");
            User u = user();
            when(userRepository.findByStripeCustomerId("cus_1")).thenReturn(Optional.of(u));
            when(subscriptionRepository.findByUserId(7L))
                .thenReturn(Optional.of(Subscription.builder().userId(7L).build()));

            service.handleSubscriptionDeleted(eventReturning(stripeSub, "evt_4", "customer.subscription.deleted"));

            assertThat(u.getPlanStatus()).isEqualTo(PlanStatus.CANCELED);
            verify(userRepository).save(u);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("invoice")
    class Invoices {

        private Invoice invoice() {
            Invoice inv = mock(Invoice.class);
            when(inv.getCustomer()).thenReturn("cus_1");
            lenient().when(inv.getId()).thenReturn("in_1");
            lenient().when(inv.getParent()).thenReturn(null);
            lenient().when(inv.getAmountPaid()).thenReturn(2000L);
            lenient().when(inv.getCurrency()).thenReturn("eur");
            return inv;
        }

        @Test
        @DisplayName("invoice.payment_succeeded garde l'utilisateur ACTIVE")
        void payment_succeeded() {
            User u = user();
            u.setPlanStatus(PlanStatus.CANCELED); // != ACTIVE → doit repasser ACTIVE
            when(userRepository.findByStripeCustomerId("cus_1")).thenReturn(Optional.of(u));
            when(subscriptionRepository.findByUserId(7L)).thenReturn(Optional.empty());

            service.handleInvoicePaymentSucceeded(eventReturning(invoice(), "evt_5", "invoice.payment_succeeded"));

            assertThat(u.getPlanStatus()).isEqualTo(PlanStatus.ACTIVE);
        }

        @Test
        @DisplayName("invoice.payment_failed est traité sans exception")
        void payment_failed() {
            when(userRepository.findByStripeCustomerId("cus_1")).thenReturn(Optional.of(user()));
            lenient().when(subscriptionRepository.findByUserId(7L)).thenReturn(Optional.empty());

            service.handleInvoicePaymentFailed(eventReturning(invoice(), "evt_6", "invoice.payment_failed"));

            verify(subscriptionHistoryRepository).save(any());
        }
    }
}
