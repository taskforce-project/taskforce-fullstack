package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Entité Subscription - Abonnement d'un utilisateur
 *
 * Cette table stocke les détails de l'abonnement actif d'un utilisateur.
 * Chaque utilisateur ne peut avoir qu'un seul abonnement actif à la fois.
 * L'historique des abonnements est géré dans SubscriptionHistory.
 */
@Entity
@Table(name = "subscriptions", indexes = {
    @Index(name = "idx_subscriptions_user_id", columnList = "user_id", unique = true),
    @Index(name = "idx_subscriptions_stripe_subscription_id", columnList = "stripe_subscription_id"),
    @Index(name = "idx_subscriptions_stripe_customer_id", columnList = "stripe_customer_id"),
    @Index(name = "idx_subscriptions_status", columnList = "status"),
    @Index(name = "idx_subscriptions_current_period_end", columnList = "current_period_end")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * ID de l'utilisateur (clé étrangère vers User)
     * Un utilisateur ne peut avoir qu'un seul abonnement actif
     */
    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    /**
     * Type de plan (FREE, PREMIUM, ENTERPRISE)
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "plan_type", nullable = false)
    @Builder.Default
    private PlanType planType = PlanType.FREE;

    /**
     * Statut de l'abonnement (ACTIVE, CANCELED, TRIALING, etc.)
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private PlanStatus status = PlanStatus.ACTIVE;

    /**
     * ID de l'abonnement dans Stripe
     * NULL pour les plans FREE
     */
    @Column(name = "stripe_subscription_id", unique = true)
    private String stripeSubscriptionId;

    /**
     * ID du client dans Stripe
     * NULL pour les plans FREE
     */
    @Column(name = "stripe_customer_id")
    private String stripeCustomerId;

    /**
     * ID du prix Stripe utilisé pour cet abonnement
     */
    @Column(name = "stripe_price_id")
    private String stripePriceId;

    /**
     * Montant de l'abonnement
     */
    @Column(precision = 10, scale = 2)
    private BigDecimal amount;

    /**
     * Devise (EUR, USD, etc.)
     */
    @Column(length = 3)
    @Builder.Default
    private String currency = "EUR";

    /**
     * Intervalle de facturation (month, year)
     */
    @Column(name = "billing_interval", length = 20)
    private String billingInterval;

    /**
     * Date de début de la période courante
     */
    @Column(name = "current_period_start")
    private LocalDateTime currentPeriodStart;

    /**
     * Date de fin de la période courante
     */
    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    /**
     * Date de fin de la période d'essai (si applicable)
     */
    @Column(name = "trial_end")
    private LocalDateTime trialEnd;

    /**
     * Si true, l'abonnement sera annulé à la fin de la période de facturation
     */
    @Column(name = "cancel_at_period_end", nullable = false)
    @Builder.Default
    private Boolean cancelAtPeriodEnd = false;

    /**
     * Date à laquelle l'abonnement a été annulé
     */
    @Column(name = "canceled_at")
    private LocalDateTime canceledAt;

    /**
     * Date de création de l'abonnement
     */
    @Column(name = "started_at")
    private LocalDateTime startedAt;

    /**
     * Date de fin de l'abonnement (si applicable)
     */
    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    /**
     * Date de création de l'enregistrement
     */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Date de dernière modification
     */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Vérifie si l'abonnement est actif
     */
    public boolean isActive() {
        return status == PlanStatus.ACTIVE || status == PlanStatus.TRIALING;
    }

    /**
     * Vérifie si l'abonnement est en période d'essai
     */
    public boolean isInTrial() {
        return status == PlanStatus.TRIALING
            && trialEnd != null
            && trialEnd.isAfter(LocalDateTime.now());
    }

    /**
     * Vérifie si l'abonnement est annulé
     */
    public boolean isCanceled() {
        return status == PlanStatus.CANCELED;
    }

    /**
     * Vérifie si l'abonnement doit être renouvelé
     */
    public boolean shouldRenew() {
        return isActive() && !cancelAtPeriodEnd;
    }

    /**
     * Vérifie si l'abonnement a expiré
     */
    public boolean isExpired() {
        return currentPeriodEnd != null && currentPeriodEnd.isBefore(LocalDateTime.now());
    }

    /**
     * Vérifie si c'est un plan payant
     */
    public boolean isPaidPlan() {
        return planType != PlanType.FREE && stripeSubscriptionId != null;
    }
}
