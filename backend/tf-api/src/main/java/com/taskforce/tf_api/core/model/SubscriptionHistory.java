package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Entité Subscription History - Historique des événements d'abonnement
 *
 * Cette table enregistre tous les événements liés aux abonnements Stripe:
 * - Création d'abonnement
 * - Modification de plan
 * - Paiement réussi/échoué
 * - Annulation
 * etc.
 */
@Entity
@Table(name = "subscription_history", indexes = {
    @Index(name = "idx_subscription_history_user_id", columnList = "user_id"),
    @Index(name = "idx_subscription_history_created_at", columnList = "created_at"),
    @Index(name = "idx_subscription_history_event_type", columnList = "event_type")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * ID de l'utilisateur concerné
     */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /**
     * Type de plan au moment de l'événement
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "plan_type", nullable = false)
    private PlanType planType;

    /**
     * Statut du plan au moment de l'événement
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "plan_status", nullable = false)
    private PlanStatus planStatus;

    /**
     * ID de l'abonnement Stripe
     */
    @Column(name = "stripe_subscription_id")
    private String stripeSubscriptionId;

    /**
     * ID de la facture Stripe (si applicable)
     */
    @Column(name = "stripe_invoice_id")
    private String stripeInvoiceId;

    /**
     * Montant payé
     */
    @Column(name = "amount_paid", precision = 10, scale = 2)
    private BigDecimal amountPaid;

    /**
     * Devise (EUR, USD, etc.)
     */
    @Column(length = 3)
    @Builder.Default
    private String currency = "EUR";

    /**
     * Date de début de la période de facturation
     */
    @Column(name = "period_start")
    private LocalDateTime periodStart;

    /**
     * Date de fin de la période de facturation
     */
    @Column(name = "period_end")
    private LocalDateTime periodEnd;

    /**
     * Type d'événement Stripe (subscription.created, invoice.paid, etc.)
     */
    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    /**
     * Données complètes de l'événement Stripe (format JSON)
     * Permet de garder une trace complète de l'événement webhook
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "event_data", columnDefinition = "jsonb")
    private Map<String, Object> eventData;

    /**
     * Date de création de l'enregistrement
     */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
