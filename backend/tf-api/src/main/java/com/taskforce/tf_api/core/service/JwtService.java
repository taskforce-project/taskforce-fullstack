package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.model.RefreshToken;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.RefreshTokenRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKey;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Service de gestion des tokens JWT
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JwtService {

    private final RefreshTokenRepository refreshTokenRepository;

    @Value("${jwt.secret:myVerySecretKeyForJWTTokenGenerationThatIsLongEnough}")
    private String jwtSecret;

    @Value("${jwt.access-token.expiration:3600}") // 1 heure en secondes
    private Long accessTokenExpiration;

    @Value("${jwt.refresh-token.expiration:2592000}") // 30 jours en secondes
    private Long refreshTokenExpiration;

    /**
     * Génère les tokens JWT (access + refresh)
     */
    @Transactional
    public AuthResponse generateTokens(User user, UserRepresentation keycloakUser) {
        log.info("Génération des tokens JWT pour l'utilisateur : {}", user.getEmail());

        // Générer l'access token
        String accessToken = generateAccessToken(user, keycloakUser);

        // Générer le refresh token
        RefreshToken refreshToken = generateRefreshToken(user);

        // Construire la réponse utilisateur
        UserResponse userResponse = UserResponse.builder()
            .id(user.getId())
            .keycloakId(user.getKeycloakId())
            .email(user.getEmail())
            .firstName(keycloakUser.getFirstName())
            .lastName(keycloakUser.getLastName())
            .planType(user.getPlanType())
            .planStatus(user.getPlanStatus())
            .subscriptionStartDate(user.getSubscriptionStartDate())
            .subscriptionEndDate(user.getSubscriptionEndDate())
            .trialEndDate(user.getTrialEndDate())
            .isActive(user.getIsActive())
            .createdAt(user.getCreatedAt())
            .build();

        return AuthResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken.getToken())
            .tokenType("Bearer")
            .expiresIn(accessTokenExpiration)
            .user(userResponse)
            .build();
    }

    /**
     * Génère un access token JWT
     */
    private String generateAccessToken(User user, UserRepresentation keycloakUser) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", user.getId());
        claims.put("keycloakId", user.getKeycloakId());
        claims.put("email", user.getEmail());
        claims.put("firstName", keycloakUser.getFirstName());
        claims.put("lastName", keycloakUser.getLastName());
        claims.put("planType", user.getPlanType().toString());

        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes());

        return Jwts.builder()
            .setClaims(claims)
            .setSubject(user.getEmail())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + accessTokenExpiration * 1000))
            .signWith(key, SignatureAlgorithm.HS512)
            .compact();
    }

    /**
     * Génère un refresh token et le stocke en DB
     */
    @Transactional
    private RefreshToken generateRefreshToken(User user) {
        String tokenValue = UUID.randomUUID().toString();

        RefreshToken refreshToken = RefreshToken.builder()
            .userId(user.getId())
            .token(tokenValue)
            .expiresAt(LocalDateTime.now().plusSeconds(refreshTokenExpiration))
            .revoked(false)
            .build();

        return refreshTokenRepository.save(refreshToken);
    }

    /**
     * Rafraîchit l'access token à partir d'un refresh token
     */
    @Transactional
    public AuthResponse refreshAccessToken(String refreshTokenValue, UserRepresentation keycloakUser) {
        log.info("Rafraîchissement du token d'accès");

        // Récupérer le refresh token
        RefreshToken refreshToken = refreshTokenRepository.findByToken(refreshTokenValue)
            .orElseThrow(() -> new RuntimeException("Refresh token invalide"));

        // Vérifier sa validité
        if (!refreshToken.isValid()) {
            throw new RuntimeException("Refresh token expiré ou révoqué");
        }

        // Mettre à jour la dernière utilisation
        refreshToken.updateLastUsed();
        refreshTokenRepository.save(refreshToken);

        // Récupérer l'utilisateur
        // Note: Il faudrait ajouter une méthode pour récupérer l'utilisateur depuis le refresh token

        // Pour l'instant, on retourne juste un message
        throw new UnsupportedOperationException("Implémentation en cours");
    }

    /**
     * Révoque un refresh token
     */
    @Transactional
    public void revokeRefreshToken(String tokenValue) {
        log.info("Révocation du refresh token");

        RefreshToken refreshToken = refreshTokenRepository.findByToken(tokenValue)
            .orElseThrow(() -> new RuntimeException("Refresh token non trouvé"));

        refreshToken.revoke();
        refreshTokenRepository.save(refreshToken);
    }

    /**
     * Révoque tous les tokens d'un utilisateur
     */
    @Transactional
    public void revokeAllUserTokens(Long userId) {
        log.info("Révocation de tous les tokens de l'utilisateur : {}", userId);
        refreshTokenRepository.revokeAllUserTokens(userId, LocalDateTime.now());
    }

    /**
     * Valide et parse un access token
     */
    public Claims validateAccessToken(String token) {
        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes());

        return Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    /**
     * Nettoie les refresh tokens expirés (à appeler périodiquement)
     */
    @Transactional
    public int cleanupExpiredTokens() {
        log.info("Nettoyage des refresh tokens expirés...");
        LocalDateTime cutoffDate = LocalDateTime.now().minusDays(30);
        int deleted = refreshTokenRepository.deleteExpiredTokens(cutoffDate);
        log.info("{} refresh tokens expirés supprimés", deleted);
        return deleted;
    }
}
