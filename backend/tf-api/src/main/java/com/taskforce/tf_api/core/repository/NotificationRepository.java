package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.Notification;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    /** Notifications non acquittées d'un utilisateur dans un workspace, triées par date desc */
    Page<Notification> findByRecipientIdAndWorkspaceIdAndAcknowledgedFalseOrderByCreatedAtDesc(
        Long recipientId, Long workspaceId, Pageable pageable
    );

    /** Toutes les notifications d'un utilisateur dans un workspace (incluant acquittées) */
    Page<Notification> findByRecipientIdAndWorkspaceIdOrderByCreatedAtDesc(
        Long recipientId, Long workspaceId, Pageable pageable
    );

    /** Compte les non-lues */
    long countByRecipientIdAndWorkspaceIdAndReadFalse(Long recipientId, Long workspaceId);

    /** Marque toutes les notifications d'un user/workspace comme lues */
    @Modifying
    @Query("""
        UPDATE Notification n
        SET n.read = true
        WHERE n.recipient.id = :recipientId
          AND n.workspace.id = :workspaceId
          AND n.read = false
    """)
    int markAllAsRead(@Param("recipientId") Long recipientId, @Param("workspaceId") Long workspaceId);

    /** Acquitte (dismiss) toutes les notifications d'un user/workspace */
    @Modifying
    @Query("""
        UPDATE Notification n
        SET n.read = true, n.acknowledged = true
        WHERE n.recipient.id = :recipientId
          AND n.workspace.id = :workspaceId
          AND n.acknowledged = false
    """)
    int acknowledgeAll(@Param("recipientId") Long recipientId, @Param("workspaceId") Long workspaceId);
}
