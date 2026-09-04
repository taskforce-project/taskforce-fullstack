package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Entité User - Utilisateur de l'application
 *
 * Cette table stocke les informations métier des utilisateurs.
 * L'authentification est gérée par Keycloak (email, password, email verification).
 * Le lien est fait via keycloakId qui référence l'ID de l'utilisateur dans Keycloak.
 */
@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_users_email", columnList = "email", unique = true),
    @Index(name = "idx_users_keycloak_id", columnList = "keycloak_id", unique = true),
    @Index(name = "idx_users_company_id", columnList = "company_id"),
    @Index(name = "idx_users_stripe_customer_id", columnList = "stripe_customer_id"),
    @Index(name = "idx_users_is_active", columnList = "is_active")
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
    @Column(name = "keycloak_id", nullable = false, unique = true, length = 100)
    private String keycloakId;

    /**
     * Email de l'utilisateur (pour référence rapide, source = Keycloak)
     * Utilisé pour les recherches et l'envoi d'emails
     */
    @Column(nullable = false, unique = true, length = 255)
    private String email;

    /**
     * Type de plan d'abonnement (FREE, PRO, ENTERPRISE)
     * Synchronisé avec la table Subscription
     */
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "plan_type", nullable = false)
    @Builder.Default
    private PlanType planType = PlanType.FREE;

    /**
     * Statut de l'abonnement Stripe (ACTIVE, CANCELED, etc.)
     * Synchronisé avec la table Subscription
     * NULL si plan FREE ou aucun abonnement actif
     */
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "plan_status", nullable = true)
    private PlanStatus planStatus;

    /**
     * ID du client dans Stripe
     * Créé lors du premier achat ou lors de l'inscription avec un plan payant
     */
    @Column(name = "stripe_customer_id", unique = true, length = 100)
    private String stripeCustomerId;

    /**
     * ID de l'abonnement actif dans Stripe
     * Référence rapide vers l'abonnement Stripe actif
     */
    @Column(name = "stripe_subscription_id", unique = true, length = 100)
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
     * Sera utilisé pour les fonctionnalités multi-entreprises futures
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
     * Suppression de compte planifiée (délai de grâce) : horodatage de la DEMANDE de suppression.
     * {@code null} = aucune suppression en cours. Le compte reste récupérable jusqu'à la purge (job).
     */
    @Column(name = "deletion_scheduled_at")
    private LocalDateTime deletionScheduledAt;

    /**
     * Indique si l'utilisateur a manifesté un intérêt pour le plan ENTERPRISE
     * Utilisé pour identifier les leads sales même s'ils démarrent avec un compte FREE
     */
    @Column(name = "enterprise_interest")
    @Builder.Default
    private Boolean enterpriseInterest = false;

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
     * Nom d'affichage personnalisé (nullable — construit depuis Keycloak si absent)
     */
    @Column(name = "display_name", length = 150)
    private String displayName;

    /**
     * URL de l'avatar de l'utilisateur (nullable)
     */
    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    /**
     * Rôle / intitulé déclaré à l'onboarding (ex. « Développeur », « Chef de projet »).
     * Sert à la personnalisation et d'amorce à la suggestion IA de compétences. Nullable.
     */
    @Column(name = "job_title", length = 150)
    private String jobTitle;

    /**
     * Vrai une fois le parcours de première prise en main franchi. Défaut FALSE : le front
     * n'affiche le wizard d'onboarding que tant qu'il vaut FALSE.
     */
    @Column(name = "onboarding_completed", nullable = false)
    @Builder.Default
    private Boolean onboardingCompleted = false;

    /**
     * Vague de bêta fermée à laquelle appartient l'utilisateur (ex. {@code beta_2026_09}). Nullable ;
     * peuplé manuellement par testeur (formulaire d'intake). Sert au filtrage des métriques par cohorte.
     */
    @Column(name = "beta_cohort", length = 50)
    private String betaCohort;

    /**
     * Contexte de test déclaré — {@code PROFESSIONAL} / {@code PERSONAL} / {@code FREE} (contrainte CHECK
     * en base). Nullable. Permet des métriques spécifiques au contexte (cf. protocole bêta).
     */
    @Column(name = "beta_context", length = 20)
    private String betaContext;

    /**
     * Vrai si l'utilisateur bénéficie effectivement d'un plan payant : un palier ≠ FREE <b>et</b> un
     * abonnement qui n'est pas en défaut de paiement.
     *
     * <p>Le second test est le correctif de {@code TF-BILL-UNPAID} : cette méthode ne regardait que
     * {@code planType}, si bien qu'un {@code invoice.payment_failed} → {@link PlanStatus#PAST_DUE}
     * (écrit par {@code StripeWebhookService}) laissait l'utilisateur conserver <b>100 %</b> de ses
     * features et de ses quotas, indéfiniment. Le statut était persisté et jamais relu.</p>
     *
     * <p><b>Pourquoi une liste de refus et non une liste d'autorisation</b> ({@code == ACTIVE || TRIALING},
     * cf. {@link #hasActiveSubscription()}) : {@code planStatus} est <b>nullable</b>, et des comptes ont un
     * palier payant sans statut — les plans posés hors Stripe, par exemple {@code V40__dev_admin_pro.sql}
     * qui fait un {@code UPDATE plan_type} sans toucher {@code plan_status}. Une liste d'autorisation les
     * rétrograderait silencieusement. On ne refuse donc que sur un défaut de paiement <b>explicite</b>.</p>
     *
     * <p>{@link PlanStatus#CANCELED} n'y figure pas volontairement : une résiliation programmée doit courir
     * jusqu'à la fin de période, et c'est {@code customer.subscription.deleted} qui repasse le palier à FREE.
     * {@link PlanStatus#INCOMPLETE} non plus : le paiement est en cours de traitement, pas en échec.</p>
     */
    public boolean isPaid() {
        return planType != null && planType != PlanType.FREE && !isDelinquent();
    }

    /** Défaut de paiement avéré — l'accès payant doit cesser. */
    private boolean isDelinquent() {
        return planStatus == PlanStatus.PAST_DUE
            || planStatus == PlanStatus.UNPAID
            || planStatus == PlanStatus.INCOMPLETE_EXPIRED;
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
