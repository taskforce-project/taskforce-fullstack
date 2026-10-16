package com.taskforce.tf_api.core.repository;

import com.taskforce.tf_api.core.model.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository pour la gestion des utilisateurs
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Trouve un utilisateur par son email
     */
    Optional<User> findByEmail(String email);

    /**
     * Trouve un utilisateur par son ID Keycloak
     */
    Optional<User> findByKeycloakId(String keycloakId);

    /**
     * Trouve un utilisateur par son ID client Stripe
     */
    Optional<User> findByStripeCustomerId(String stripeCustomerId);

    /**
     * Trouve un utilisateur par son ID d'abonnement Stripe
     */
    Optional<User> findByStripeSubscriptionId(String stripeSubscriptionId);

    /**
     * Vérifie si un email existe déjà
     */
    boolean existsByEmail(String email);

    /**
     * Vérifie si un ID Keycloak existe déjà
     */
    boolean existsByKeycloakId(String keycloakId);

    /**
     * Trouve tous les utilisateurs actifs avec un plan spécifique
     */
    @Query("SELECT u FROM User u WHERE u.planType = :planType AND u.isActive = true")
    Optional<User> findActiveUsersByPlanType(@Param("planType") String planType);

    /**
     * Recherche par email ou displayName (insensible à la casse), limitée aux personnes qui partagent au
     * moins un workspace avec l'appelant (OSS-1.7). L'ancienne recherche portait sur toute l'instance et
     * révélait les adresses de comptes étrangers. Inviter quelqu'un d'autre passe par son adresse complète
     * (invitation par e-mail). Nombre de résultats borné par le Pageable.
     */
    @Query("""
        SELECT u FROM User u
        WHERE u.isActive = true
          AND (LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(u.displayName) LIKE LOWER(CONCAT('%', :q, '%')))
          AND EXISTS (
              SELECT 1 FROM WorkspaceMember mine, WorkspaceMember theirs
              WHERE mine.user.id = :callerId
                AND theirs.workspace = mine.workspace
                AND theirs.user = u)
        ORDER BY u.email ASC
        """)
    List<User> searchCoMembers(@Param("q") String q, @Param("callerId") Long callerId, Pageable pageable);

    /** Comptes dont la suppression planifiée a dépassé le délai de grâce (à purger). */
    List<User> findByDeletionScheduledAtBefore(java.time.LocalDateTime cutoff);
}
