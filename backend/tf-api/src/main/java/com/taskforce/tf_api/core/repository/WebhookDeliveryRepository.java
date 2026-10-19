package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.WebhookDelivery;

public interface WebhookDeliveryRepository extends JpaRepository<WebhookDelivery, Long> {

    /**
     * Envois dus, verrouillés pour cette transaction. {@code SKIP LOCKED} : deux instances du backend ne prennent
     * jamais le même envoi ; l'appelant le repousse d'un bail avant de relâcher le verrou.
     */
    @Query(value = "SELECT * FROM webhook_deliveries WHERE status = 'PENDING' AND next_attempt_at <= :now "
        + "ORDER BY next_attempt_at LIMIT :limit FOR UPDATE SKIP LOCKED", nativeQuery = true)
    List<WebhookDelivery> lockDue(@Param("now") LocalDateTime now, @Param("limit") int limit);

    /** Derniers envois d'un webhook, pour l'écran des webhooks. */
    List<WebhookDelivery> findTop20ByWebhookIdOrderByCreatedAtDesc(Long webhookId);

    /**
     * Purge des envois terminés (livrés ou abandonnés) plus anciens que {@code cutoff}, appelée par le
     * {@link com.taskforce.tf_api.core.service.RetentionScheduler} : le corps reprend le contenu des issues.
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM WebhookDelivery d WHERE d.status <> com.taskforce.tf_api.core.enums.WebhookDeliveryStatus.PENDING "
        + "AND d.createdAt < :cutoff")
    int deleteFinishedBefore(@Param("cutoff") LocalDateTime cutoff);
}
