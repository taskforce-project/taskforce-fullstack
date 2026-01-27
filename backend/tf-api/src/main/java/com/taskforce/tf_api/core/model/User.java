package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Entité User - Utilisateur de l'application
 *
 * Cette table stocke les informations métier des utilisateurs.
 * L'authentification est gérée par Keycloak (email, password, email verification).
 * Le lien est fait via keycloakId qui référence l'ID de l'utilisateur dans Keycloak.
 */
@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_users_email", columnList = "email"),
    @Index(name = "idx_users_keycloak_id", columnList = "keycloak_id"),
    @Index(name = "idx_users_company_id", columnList = "company_id"),
    @Index(name = "idx_users_stripe_customer_id", columnList = "stripe_customer_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * ID de l'utilisateur dans Keycloak (source of truth pour l'authentification)
     * Récupéré depuis le token JWT lors de l'authentification
     */
    @Column(name = "keycloak_id", nullable = false, unique = true)
    private String keycloakId;

    /**
     * Email de l'utilisateur (pour référence rapide, source = Keycloak)
     */
    @Column(nullable = false, unique = true)
    private String email;

    /**
     * Type de plan d'abonnement (FREE, PREMIUM, ENTERPRISE)
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "plan_type", nullable = false)
    @Builder.Default
    private PlanType planType = PlanType.FREE;

    /**
     * Statut de l'abonnement Stripe (ACTIVE, CANCELED, etc.)
     * NULL si plan FREE ou aucun abonnement actif
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "plan_status")
    private PlanStatus planStatus;

    /**
     * ID du client dans Stripe
     */
    @Column(name = "stripe_customer_id", unique = true)
    private String stripeCustomerId;

    /**
     * ID de l'abonnement actif dans Stripe
     */
    @Column(name = "stripe_subscription_id", unique = true)
    private String stripeSubscriptionId;

    /**
     * Date de début de l'abonnement
     */
    @Column(name = "subscription_start_date")
    private LocalDateTime subscriptionStartDate;

    /**
     * Date de fin de l'abonnement (renouvellement ou expiration)
     */
    @Column(name = "subscription_end_date")
    private LocalDateTime subscriptionEndDate;

    /**
     * Date de fin de la période d'essai (si applicable)
     */
    @Column(name = "trial_end_date")
    private LocalDateTime trialEndDate;

    /**
     * ID de l'entreprise (peut être null pour les utilisateurs FREE)
     */
    @Column(name = "company_id")
    private Long companyId;

    /**
     * Indique si l'utilisateur est actif
     */
    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

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
     * Utilisateur qui a créé cet enregistrement (keycloakId)
     */
    @Column(name = "created_by")
    private String createdBy;

    /**
     * Utilisateur qui a modifié cet enregistrement (keycloakId)
     */
    @Column(name = "updated_by")
    private String updatedBy;

    /**
     * Vérifie si l'utilisateur a un plan premium ou supérieur
     */
    public boolean isPremiumOrHigher() {
        return planType == PlanType.PREMIUM || planType == PlanType.ENTERPRISE;
    }

    /**
     * Vérifie si l'abonnement est actif
     */
    public boolean hasActiveSubscription() {
        return planStatus == PlanStatus.ACTIVE || planStatus == PlanStatus.TRIALING;
    }

    /**
     * Vérifie si l'utilisateur est en période d'essai
     */
    public boolean isInTrial() {
        return planStatus == PlanStatus.TRIALING
            && trialEndDate != null
            && trialEndDate.isAfter(LocalDateTime.now());
    }
}
