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
 * Jeton personnel (OSS-5.1) : durable, révocable, propre à une personne, utilisable seulement sur le serveur MCP de
 * l'instance. Seule son empreinte SHA-256 est stockée ; le jeton lui-même n'est montré qu'à sa création.
 */
@Entity
@Table(name = "personal_access_tokens")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersonalAccessToken extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Nom choisi par la personne (« Claude Code on my laptop »). */
    @Column(nullable = false, length = 80)
    private String name;

    /** Empreinte SHA-256 (hexadécimal) du jeton complet. */
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    /** Début du jeton (`tfp_` + 8 caractères), pour le reconnaître dans la liste. */
    @Column(name = "token_hint", nullable = false, length = 16)
    private String tokenHint;

    /** Fin de validité ; null = sans expiration. */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /** Dernier usage, mis à jour au plus toutes les quelques minutes. */
    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    /** Révocation ; un jeton révoqué ne sert plus et sort de la liste. */
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;
}
