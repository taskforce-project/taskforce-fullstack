package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.RefreshToken;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.RefreshTokenRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.representations.idm.UserRepresentation;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("JwtService Tests")
class JwtServiceTest {

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @InjectMocks
    private JwtService jwtService;

    private static final String TEST_JWT_SECRET = "myVerySecretKeyForJWTTokenGenerationThatIsLongEnoughForHS512AlgorithmUsage";
    private static final Long ACCESS_TOKEN_EXPIRATION = 3600L; // 1 heure
    private static final Long REFRESH_TOKEN_EXPIRATION = 2592000L; // 30 jours

    private User testUser;
    private UserRepresentation keycloakUser;

    @BeforeEach
    void setup() {
        // Configuration des propriétés via ReflectionTestUtils
        ReflectionTestUtils.setField(jwtService, "jwtSecret", TEST_JWT_SECRET);
        ReflectionTestUtils.setField(jwtService, "accessTokenExpiration", ACCESS_TOKEN_EXPIRATION);
        ReflectionTestUtils.setField(jwtService, "refreshTokenExpiration", REFRESH_TOKEN_EXPIRATION);

        // Créer un utilisateur de test
        testUser = User.builder()
                .id(1L)
                .keycloakId("keycloak-123")
                .email("test@example.com")
                .planType(PlanType.PRO)
                .planStatus(PlanStatus.ACTIVE)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build();

        // Créer une représentation Keycloak de test
        keycloakUser = new UserRepresentation();
        keycloakUser.setFirstName("John");
        keycloakUser.setLastName("Doe");
        keycloakUser.setEmail("test@example.com");
    }

    @Nested
    @DisplayName("Generate Tokens Tests")
    class GenerateTokensTests {

        @Test
        @DisplayName("devrait générer access token et refresh token")
        void generateTokens_withValidUser_shouldGenerateTokens() {
            // Given
            RefreshToken savedRefreshToken = RefreshToken.builder()
                    .userId(testUser.getId())
                    .token("refresh-token-uuid")
                    .expiresAt(LocalDateTime.now().plusDays(30))
                    .revoked(false)
                    .build();

            when(refreshTokenRepository.save(any(RefreshToken.class))).thenReturn(savedRefreshToken);

            // When
            AuthResponse response = jwtService.generateTokens(testUser, keycloakUser);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getAccessToken()).isNotEmpty();
            assertThat(response.getRefreshToken()).isEqualTo("refresh-token-uuid");
            assertThat(response.getTokenType()).isEqualTo("Bearer");
            assertThat(response.getExpiresIn()).isEqualTo(ACCESS_TOKEN_EXPIRATION);
            assertThat(response.getUser()).isNotNull();
            assertThat(response.getUser().getEmail()).isEqualTo("test@example.com");

            verify(refreshTokenRepository).save(any(RefreshToken.class));
        }

        @Test
        @DisplayName("access token devrait contenir les bonnes claims")
        void generateTokens_shouldIncludeCorrectClaimsInAccessToken() {
            // Given
            RefreshToken savedRefreshToken = RefreshToken.builder()
                    .token("refresh-token")
                    .build();
            when(refreshTokenRepository.save(any(RefreshToken.class))).thenReturn(savedRefreshToken);

            // When
            AuthResponse response = jwtService.generateTokens(testUser, keycloakUser);

            // Then - Décoder le JWT pour vérifier les claims
            SecretKey key = Keys.hmacShaKeyFor(TEST_JWT_SECRET.getBytes());
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(response.getAccessToken())
                    .getPayload();

            assertThat(claims.getSubject()).isEqualTo("test@example.com");
            assertThat(claims.get("userId", Long.class)).isEqualTo(1L);
            assertThat(claims.get("keycloakId", String.class)).isEqualTo("keycloak-123");
            assertThat(claims.get("email", String.class)).isEqualTo("test@example.com");
            assertThat(claims.get("firstName", String.class)).isEqualTo("John");
            assertThat(claims.get("lastName", String.class)).isEqualTo("Doe");
            assertThat(claims.get("planType", String.class)).isEqualTo("PRO");
        }

        @Test
        @DisplayName("refresh token devrait être sauvegardé en DB")
        void generateTokens_shouldSaveRefreshTokenToDatabase() {
            // Given
            RefreshToken savedToken = RefreshToken.builder().token("uuid").build();
            when(refreshTokenRepository.save(any(RefreshToken.class))).thenReturn(savedToken);

            // When
            jwtService.generateTokens(testUser, keycloakUser);

            // Then
            verify(refreshTokenRepository).save(argThat(token ->
                    token.getUserId().equals(testUser.getId()) &&
                            !token.getToken().isEmpty() &&
                            token.getExpiresAt().isAfter(LocalDateTime.now()) &&
                            !token.getRevoked()
            ));
        }

        @Test
        @DisplayName("devrait construire UserResponse avec toutes les infos")
        void generateTokens_shouldBuildCompleteUserResponse() {
            // Given
            testUser.setSubscriptionStartDate(LocalDateTime.now().minusDays(10));
            testUser.setSubscriptionEndDate(LocalDateTime.now().plusDays(20));
            testUser.setTrialEndDate(LocalDateTime.now().plusDays(30));

            RefreshToken savedToken = RefreshToken.builder().token("uuid").build();
            when(refreshTokenRepository.save(any(RefreshToken.class))).thenReturn(savedToken);

            // When
            AuthResponse response = jwtService.generateTokens(testUser, keycloakUser);

            // Then
            assertThat(response.getUser().getId()).isEqualTo(1L);
            assertThat(response.getUser().getKeycloakId()).isEqualTo("keycloak-123");
            assertThat(response.getUser().getEmail()).isEqualTo("test@example.com");
            assertThat(response.getUser().getFirstName()).isEqualTo("John");
            assertThat(response.getUser().getLastName()).isEqualTo("Doe");
            assertThat(response.getUser().getPlanType()).isEqualTo(PlanType.PRO);
            assertThat(response.getUser().getPlanStatus()).isEqualTo(PlanStatus.ACTIVE);
            assertThat(response.getUser().getIsActive()).isTrue();
            assertThat(response.getUser().getSubscriptionStartDate()).isNotNull();
            assertThat(response.getUser().getSubscriptionEndDate()).isNotNull();
            assertThat(response.getUser().getTrialEndDate()).isNotNull();
        }
    }

    // NB (30/06) : bloc « Refresh Access Token Tests » retiré — `JwtService.refreshAccessToken`
    // n'existe plus (le refresh/rotation vit désormais dans AuthService, couvert par AuthServiceTest).
    // Ces tests ne compilaient plus et bloquaient tout le module test.

    @Nested
    @DisplayName("Refresh Token Generation Tests")
    class RefreshTokenGenerationTests {

        @Test
        @DisplayName("devrait générer un refresh token avec UUID unique")
        void generateRefreshToken_shouldGenerateUniqueUUID() {
            // Given
            RefreshToken savedToken1 = RefreshToken.builder()
                    .token("uuid-1")
                    .build();
            RefreshToken savedToken2 = RefreshToken.builder()
                    .token("uuid-2")
                    .build();

            when(refreshTokenRepository.save(any(RefreshToken.class)))
                    .thenReturn(savedToken1)
                    .thenReturn(savedToken2);

            // When
            AuthResponse response1 = jwtService.generateTokens(testUser, keycloakUser);
            AuthResponse response2 = jwtService.generateTokens(testUser, keycloakUser);

            // Then - Les tokens devraient être différents
            assertThat(response1.getRefreshToken()).isNotEqualTo(response2.getRefreshToken());
        }

        @Test
        @DisplayName("refresh token devrait avoir la bonne durée de validité")
        void generateRefreshToken_shouldHaveCorrectExpiration() {
            // Given
            when(refreshTokenRepository.save(any(RefreshToken.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            // When
            jwtService.generateTokens(testUser, keycloakUser);

            // Then
            verify(refreshTokenRepository).save(argThat(token -> {
                LocalDateTime expectedExpiry = LocalDateTime.now().plusSeconds(REFRESH_TOKEN_EXPIRATION);
                LocalDateTime actualExpiry = token.getExpiresAt();
                
                // Vérifier que l'expiration est dans les 10 secondes de l'attendu
                return actualExpiry.isAfter(expectedExpiry.minusSeconds(10)) &&
                        actualExpiry.isBefore(expectedExpiry.plusSeconds(10));
            }));
        }
    }

    @Nested
    @DisplayName("Validate / Revoke / Cleanup Tests")
    class ValidateRevokeCleanup {

        private String freshAccessToken() {
            when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(i -> i.getArgument(0));
            return jwtService.generateTokens(testUser, keycloakUser).getAccessToken();
        }

        @Test
        @DisplayName("validateAccessToken renvoie les claims d'un token valide")
        void validate_returns_claims() {
            io.jsonwebtoken.Claims claims = jwtService.validateAccessToken(freshAccessToken());
            assertThat(claims.getSubject()).isNotNull();
        }

        @Test
        @DisplayName("validateAccessToken rejette un token invalide")
        void validate_rejects_garbage() {
            assertThatThrownBy(() -> jwtService.validateAccessToken("not.a.jwt"))
                .isInstanceOf(Exception.class);
        }

        @Test
        @DisplayName("parseClaimsAllowExpired lit les claims (signature vérifiée)")
        void parse_allows_reading() {
            assertThat(jwtService.parseClaimsAllowExpired(freshAccessToken())).isNotNull();
        }

        @Test
        @DisplayName("revokeRefreshToken révoque et persiste le token trouvé")
        void revoke_found() {
            RefreshToken rt = RefreshToken.builder().userId(1L).token("tok").revoked(false)
                .expiresAt(LocalDateTime.now().plusDays(1)).build();
            when(refreshTokenRepository.findByToken("tok")).thenReturn(Optional.of(rt));

            jwtService.revokeRefreshToken("tok");

            assertThat(rt.getRevoked()).isTrue();
            verify(refreshTokenRepository).save(rt);
        }

        @Test
        @DisplayName("revokeRefreshToken lève une erreur si le token est introuvable")
        void revoke_not_found() {
            when(refreshTokenRepository.findByToken("x")).thenReturn(Optional.empty());
            assertThatThrownBy(() -> jwtService.revokeRefreshToken("x")).isInstanceOf(RuntimeException.class);
        }

        @Test
        @DisplayName("revokeAllUserTokens délègue au repository")
        void revoke_all() {
            jwtService.revokeAllUserTokens(1L);
            verify(refreshTokenRepository).revokeAllUserTokens(org.mockito.ArgumentMatchers.eq(1L), any());
        }

        @Test
        @DisplayName("cleanupExpiredTokens / cleanupRevokedTokens renvoient le nombre supprimé")
        void cleanup_returns_counts() {
            when(refreshTokenRepository.deleteExpiredTokens(any())).thenReturn(3);
            when(refreshTokenRepository.deleteRevokedTokens(any())).thenReturn(2);

            assertThat(jwtService.cleanupExpiredTokens()).isEqualTo(3);
            assertThat(jwtService.cleanupRevokedTokens()).isEqualTo(2);
        }
    }
}
