package com.taskforce.tf_api.core.repository;

import com.taskforce.tf_api.core.model.SubscriptionHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Repository pour l'historique des abonnements
 */
@Repository
public interface SubscriptionHistoryRepository extends JpaRepository<SubscriptionHistory, UUID> {

    /**
     * Trouve l'historique d'un utilisateur, trié par date décroissante
     */
    Page<SubscriptionHistory> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    /**
     * Trouve l'historique d'un utilisateur
     */
    List<SubscriptionHistory> findByUserId(Long userId);

    /**
     * Trouve l'historique par ID d'abonnement Stripe
     */
    List<SubscriptionHistory> findByStripeSubscriptionId(String stripeSubscriptionId);

    /**
     * Trouve l'historique par type d'événement
     */
    List<SubscriptionHistory> findByEventType(String eventType);

    /**
     * Trouve l'historique d'un utilisateur pour un type d'événement spécifique
     */
    @Query("SELECT sh FROM SubscriptionHistory sh WHERE sh.userId = :userId AND sh.eventType = :eventType ORDER BY sh.createdAt DESC")
    List<SubscriptionHistory> findByUserIdAndEventType(
        @Param("userId") Long userId,
        @Param("eventType") String eventType
    );

    /**
     * Trouve l'historique entre deux dates
     */
    @Query("SELECT sh FROM SubscriptionHistory sh WHERE sh.createdAt BETWEEN :startDate AND :endDate ORDER BY sh.createdAt DESC")
    List<SubscriptionHistory> findByDateRange(
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate
    );

    /**
     * Trouve le dernier événement pour un utilisateur
     */
    @Query("SELECT sh FROM SubscriptionHistory sh WHERE sh.userId = :userId ORDER BY sh.createdAt DESC LIMIT 1")
    SubscriptionHistory findLatestByUserId(@Param("userId") Long userId);
}
