package com.taskforce.tf_api.core.repository;

import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.model.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository pour la gestion des abonnements
 */
@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    /**
     * Trouve l'abonnement actif d'un utilisateur
     */
    Optional<Subscription> findByUserId(Long userId);

    /**
     * Trouve un abonnement par son ID Stripe
     */
    Optional<Subscription> findByStripeSubscriptionId(String stripeSubscriptionId);

    /**
     * Trouve un abonnement par l'ID client Stripe
     */
    Optional<Subscription> findByStripeCustomerId(String stripeCustomerId);

    /**
     * Trouve tous les abonnements actifs
     */
    List<Subscription> findByStatus(PlanStatus status);

    /**
     * Trouve tous les abonnements qui expirent bientôt
     */
    @Query("SELECT s FROM Subscription s WHERE s.currentPeriodEnd BETWEEN :start AND :end AND s.status = :status")
    List<Subscription> findExpiringSubscriptions(
        @Param("start") LocalDateTime start,
        @Param("end") LocalDateTime end,
        @Param("status") PlanStatus status
    );

    /**
     * Trouve tous les abonnements en période d'essai qui se terminent bientôt
     */
    @Query("SELECT s FROM Subscription s WHERE s.trialEnd BETWEEN :start AND :end AND s.status = 'TRIALING'")
    List<Subscription> findExpiringTrials(
        @Param("start") LocalDateTime start,
        @Param("end") LocalDateTime end
    );

    /**
     * Vérifie si un utilisateur a un abonnement actif
     */
    @Query("SELECT CASE WHEN COUNT(s) > 0 THEN true ELSE false END FROM Subscription s WHERE s.userId = :userId AND (s.status = 'ACTIVE' OR s.status = 'TRIALING')")
    boolean hasActiveSubscription(@Param("userId") Long userId);
}
