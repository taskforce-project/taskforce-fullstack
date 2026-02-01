package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.OtpStatus;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.model.OtpVerification;

/**
 * Repository pour la gestion des codes OTP
 */
@Repository
public interface OtpVerificationRepository extends JpaRepository<OtpVerification, UUID> {

    /**
     * Trouve un OTP valide par email et code
     */
    @Query("SELECT o FROM OtpVerification o WHERE o.email = :email AND o.otpCode = :code AND o.otpStatus = 'PENDING' AND o.expiresAt > :now ORDER BY o.createdAt DESC LIMIT 1")
    Optional<OtpVerification> findValidOtpByEmailAndCode(
        @Param("email") String email,
        @Param("code") String code,
        @Param("now") LocalDateTime now
    );

    /**
     * Trouve un OTP en attente par email (le plus récent)
     */
    @Query("SELECT o FROM OtpVerification o WHERE o.email = :email AND o.otpStatus = 'PENDING' AND o.expiresAt > CURRENT_TIMESTAMP ORDER BY o.createdAt DESC LIMIT 1")
    Optional<OtpVerification> findPendingOtpByEmail(@Param("email") String email);

    /**
     * Trouve un OTP par email, type et statut
     */
    Optional<OtpVerification> findFirstByEmailAndOtpTypeAndOtpStatusOrderByCreatedAtDesc(
        String email,
        OtpType otpType,
        OtpStatus otpStatus
    );

    /**
     * Trouve tous les OTP d'un utilisateur
     */
    List<OtpVerification> findByUserId(Long userId);

    /**
     * Trouve tous les OTP d'un email
     */
    List<OtpVerification> findByEmail(String email);

    /**
     * Trouve les OTP expirés
     */
    @Query("SELECT o FROM OtpVerification o WHERE o.expiresAt < :now AND o.otpStatus = 'PENDING'")
    List<OtpVerification> findExpiredOtps(@Param("now") LocalDateTime now);

    /**
     * Marque tous les OTP d'un email comme expirés
     */
    @Modifying
    @Query("UPDATE OtpVerification o SET o.otpStatus = 'EXPIRED' WHERE o.email = :email AND o.otpStatus = 'PENDING'")
    int expireAllPendingOtpsByEmail(@Param("email") String email);

    /**
     * Supprime les OTP expirés depuis plus de X jours
     */
    @Modifying
    @Query("DELETE FROM OtpVerification o WHERE o.expiresAt < :cutoffDate")
    int deleteExpiredOtps(@Param("cutoffDate") LocalDateTime cutoffDate);

    /**
     * Compte les tentatives OTP récentes pour un email (protection spam)
     */
    @Query("SELECT COUNT(o) FROM OtpVerification o WHERE o.email = :email AND o.createdAt > :since")
    long countRecentOtpAttempts(@Param("email") String email, @Param("since") LocalDateTime since);
}
