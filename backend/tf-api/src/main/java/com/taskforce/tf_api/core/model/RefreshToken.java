package com.taskforce.tf_api.core.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Entité RefreshToken - Token de rafraîchissement JWT
 *
 * Cette table stocke les refresh tokens pour permettre aux utilisateurs
 * de renouveler leur access token sans se reconnecter.
 * Les refresh tokens ont une durée de vie plus longue que les access tokens.
 */
@Entity
@Table(name = "refresh_tokens", indexes = {
    @Index(name = "idx_refresh_tokens_user_id", columnList = "user_id"),
    @Index(name = "idx_refresh_tokens_token", columnList = "token", unique = true),
    @Index(name = "idx_refresh_tokens_expires_at", columnList = "expires_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * ID de l'utilisateur (clé étrangère vers User)
     */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /**
     * Token de rafraîchissement (UUID unique)
     */
    @Column(nullable = false, unique = true, length = 500)
    private String token;

    /**
     * Date d'expiration du token
     */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /**
     * Indique si le token a été révoqué (déconnexion, changement de mot de passe, etc.)
     */
    @Column(nullable = false)
    @Builder.Default
    private Boolean revoked = false;

    /**
     * Date de révocation du token
     */
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    /**
     * Adresse IP de l'utilisateur lors de la création du token
     */
    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    /**
     * User-Agent du navigateur lors de la création du token
     */
    @Column(name = "user_agent", length = 500)
    private String userAgent;

    /**
     * Date de dernière utilisation du token
     */
    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    /**
     * Date de création du token
     */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Vérifie si le token est expiré
     */
    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }

    /**
     * Vérifie si le token est valide (non révoqué et non expiré)
     */
    public boolean isValid() {
        return !revoked && !isExpired();
    }

    /**
     * Révoque le token
     */
    public void revoke() {
        this.revoked = true;
        this.revokedAt = LocalDateTime.now();
    }

    /**
     * Met à jour la date de dernière utilisation
     */
    public void updateLastUsed() {
        this.lastUsedAt = LocalDateTime.now();
    }
}
