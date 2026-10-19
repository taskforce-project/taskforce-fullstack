package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Session de l'app desktop, ouverte par la connexion dans la webapp ({@code DesktopSessionService}) : un jeton durable
 * que l'app garde chiffré par le système. Seule son empreinte SHA-256 est stockée.
 */
@Entity
@Table(name = "desktop_sessions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DesktopSession extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** L'ordinateur, tel que l'app le décrit (« Windows », « Linux »). */
    @Column(nullable = false, length = 80)
    private String name;

    /** Empreinte SHA-256 (hexadécimal) du jeton complet. */
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    /** Fin de validité, repoussée quand l'app relit le compte (session glissante). */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /** Dernier usage, mis à jour au plus une fois par heure. */
    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;
}
