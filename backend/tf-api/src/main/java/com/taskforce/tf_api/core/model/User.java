package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;


import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
     * ID de l'entreprise (peut être null)
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

}
