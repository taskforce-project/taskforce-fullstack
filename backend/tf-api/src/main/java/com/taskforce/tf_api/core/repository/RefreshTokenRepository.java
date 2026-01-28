package com.taskforce.tf_api.core.repository;

import com.taskforce.tf_api.core.model.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository pour la gestion des refresh tokens JWT
 */
@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    /**
     * Trouve un refresh token par sa valeur
     */
    Optional<RefreshToken> findByToken(String token);

    /**
     * Trouve tous les tokens d'un utilisateur
     */
    List<RefreshToken> findByUserId(Long userId);

    /**
     * Trouve tous les tokens valides d'un utilisateur
     */
    @Query("SELECT rt FROM RefreshToken rt WHERE rt.userId = :userId AND rt.revoked = false AND rt.expiresAt > :now")
    List<RefreshToken> findValidTokensByUserId(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * Révoque tous les tokens d'un utilisateur
     */
    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revoked = true, rt.revokedAt = :revokedAt WHERE rt.userId = :userId AND rt.revoked = false")
    int revokeAllUserTokens(@Param("userId") Long userId, @Param("revokedAt") LocalDateTime revokedAt);

    /**
     * Supprime les tokens expirés depuis plus de X jours
     */
    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.expiresAt < :cutoffDate")
    int deleteExpiredTokens(@Param("cutoffDate") LocalDateTime cutoffDate);

    /**
     * Supprime tous les tokens révoqués depuis plus de X jours
     */
    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.revoked = true AND rt.revokedAt < :cutoffDate")
    int deleteRevokedTokens(@Param("cutoffDate") LocalDateTime cutoffDate);

    /**
     * Compte les tokens actifs d'un utilisateur
     */
    @Query("SELECT COUNT(rt) FROM RefreshToken rt WHERE rt.userId = :userId AND rt.revoked = false AND rt.expiresAt > :now")
    long countActiveTokensByUserId(@Param("userId") Long userId, @Param("now") LocalDateTime now);
}
