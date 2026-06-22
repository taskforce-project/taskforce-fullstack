package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.model.AuditLog;

/**
 * Entrée du journal d'audit exposée aux administrateurs du workspace (C21 monitoring).
 */
public record AuditLogResponse(
    Long id,
    String action,
    String entityType,
    String entityId,
    Long actorUserId,
    String details,
    LocalDateTime createdAt
) {
    public static AuditLogResponse from(AuditLog a) {
        return new AuditLogResponse(
            a.getId(), a.getAction(), a.getEntityType(), a.getEntityId(),
            a.getActorUserId(), a.getDetails(), a.getCreatedAt()
        );
    }
}
