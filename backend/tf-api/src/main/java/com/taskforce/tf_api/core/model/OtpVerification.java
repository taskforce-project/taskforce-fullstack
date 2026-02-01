package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.taskforce.tf_api.core.enums.OtpStatus;
import com.taskforce.tf_api.core.enums.OtpType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * Entité OTP Verification - Code OTP pour vérification email et réinitialisation mot de passe
 *
 * Cette table stocke les codes OTP à 6 chiffres envoyés par email pour:
 * - Vérifier l'adresse email lors de l'inscription
 * - Réinitialiser le mot de passe
 * - Authentification à deux facteurs (2FA)
 */
@Entity
@Table(name = "otp_verification", indexes = {
    @Index(name = "idx_otp_user_id", columnList = "user_id"),
    @Index(name = "idx_otp_email", columnList = "email"),
    @Index(name = "idx_otp_code", columnList = "otp_code"),
    @Index(name = "idx_otp_status", columnList = "otp_status"),
    @Index(name = "idx_otp_expires_at", columnList = "expires_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OtpVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * ID de l'utilisateur concerné
     * Peut être NULL lors de l'inscription (avant création du compte)
     */
    @Column(name = "user_id")
    private Long userId;

    /**
     * ID Keycloak de l'utilisateur (si déjà créé dans Keycloak)
     * Permet de lier l'OTP à un utilisateur Keycloak avant création dans notre DB
     */
    @Column(name = "keycloak_id", length = 100)
    private String keycloakId;

    /**
     * Code OTP à 6 chiffres
     */
    @Column(name = "otp_code", nullable = false, length = 10)
    private String otpCode;

    /**
     * Type d'OTP (EMAIL_VERIFICATION, PASSWORD_RESET, TWO_FACTOR_AUTH)
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "otp_type", nullable = false)
    private OtpType otpType;

    /**
     * Statut de l'OTP (PENDING, VERIFIED, EXPIRED, USED)
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "otp_status", nullable = false)
    @Builder.Default
    private OtpStatus otpStatus = OtpStatus.PENDING;

    /**
     * Email auquel le code a été envoyé
     */
    @Column(nullable = false)
    private String email;

    /**
     * Plan sélectionné par l'utilisateur lors de l'inscription
     * (Stocké temporairement jusqu'à la vérification OTP)
     */
    @Column(name = "plan_type", length = 20)
    private String planType;

    /**
     * Nombre de tentatives de validation
     */
    @Column(nullable = false)
    @Builder.Default
    private Integer attempts = 0;

    /**
     * Nombre maximum de tentatives autorisées
     */
    @Column(name = "max_attempts", nullable = false)
    @Builder.Default
    private Integer maxAttempts = 5;

    /**
     * Date d'expiration du code OTP
     */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /**
     * Date de vérification (quand le code a été validé)
     */
    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    /**
     * Date de création
     */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Date de dernière modification
     */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Vérifie si le code OTP est expiré
     */
    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }

    /**
     * Vérifie si le nombre maximum de tentatives a été atteint
     */
    public boolean hasReachedMaxAttempts() {
        return attempts >= maxAttempts;
    }

    /**
     * Vérifie si le code peut être validé
     */
    public boolean canBeValidated() {
        return otpStatus == OtpStatus.PENDING
            && !isExpired()
            && !hasReachedMaxAttempts();
    }

    /**
     * Incrémente le nombre de tentatives
     */
    public void incrementAttempts() {
        this.attempts++;

        // Si max tentatives atteint, marquer comme expiré
        if (hasReachedMaxAttempts()) {
            this.otpStatus = OtpStatus.EXPIRED;
        }
    }

    /**
     * Marque le code comme vérifié
     */
    public void markAsVerified() {
        this.otpStatus = OtpStatus.VERIFIED;
        this.verifiedAt = LocalDateTime.now();
    }

    /**
     * Marque le code comme expiré
     */
    public void markAsExpired() {
        this.otpStatus = OtpStatus.EXPIRED;
    }

    /**
     * Marque le code comme utilisé
     */
    public void markAsUsed() {
        this.otpStatus = OtpStatus.USED;
    }
}
