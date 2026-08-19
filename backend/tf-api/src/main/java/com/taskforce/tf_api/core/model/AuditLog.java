package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

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
 * Entrée du journal d'audit (RGPD C11.1 + sécurité C21).
 *
 * <p>Trace les actions sensibles (connexion, changement de rôle, suppressions, actions RGPD…).
 * {@code workspaceId}/{@code actorUserId} sont volontairement de simples identifiants (pas de
 * {@code @ManyToOne}) avec FK {@code ON DELETE SET NULL} en base : le journal doit survivre à la
 * suppression/anonymisation d'un utilisateur ou d'un workspace.</p>
 */
@Entity
@Table(
    name = "audit_logs",
    indexes = {
        @Index(name = "idx_audit_logs_workspace_id", columnList = "workspace_id"),
        @Index(name = "idx_audit_logs_actor",        columnList = "actor_user_id"),
        @Index(name = "idx_audit_logs_created_at",   columnList = "created_at")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id")
    private Long workspaceId;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(nullable = false, length = 64)
    private String action;

    @Column(name = "entity_type", length = 64)
    private String entityType;

    @Column(name = "entity_id", length = 64)
    private String entityId;

    /** Détails libres au format JSON (texte). */
    @Column(columnDefinition = "TEXT")
    private String details;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
