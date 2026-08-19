package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("KeycloakAuthService Tests")
class KeycloakAuthServiceTest {

    @Mock
    private RestTemplate restTemplate;

    @InjectMocks
    private KeycloakAuthService keycloakAuthService;

    @BeforeEach
    void setup() {
        // Configuration des propriétés
        ReflectionTestUtils.setField(keycloakAuthService, "keycloakUrl", "http://localhost:8180");
        ReflectionTestUtils.setField(keycloakAuthService, "realm", "taskforce");
        ReflectionTestUtils.setField(keycloakAuthService, "clientId", "taskforce-backend");
        ReflectionTestUtils.setField(keycloakAuthService, "clientSecret", "test-secret");
    }

    @Nested
    @DisplayName("Authenticate Tests")
    class AuthenticateTests {

        @Test
        @DisplayName("devrait authentifier avec succès et retourner tokens")
        void authenticate_withValidCredentials_shouldReturnTokens() {
            // Given
            String email = "test@example.com";
            String password = "Password123!";

            Map<String, Object> keycloakResponse = new HashMap<>();
            keycloakResponse.put("access_token", "access-token-123");
            keycloakResponse.put("refresh_token", "refresh-token-456");
            keycloakResponse.put("token_type", "Bearer");
            keycloakResponse.put("expires_in", 3600);
            keycloakResponse.put("refresh_expires_in", 2592000);

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenReturn(new ResponseEntity<>(keycloakResponse, HttpStatus.OK));

            // When
            KeycloakTokenResponse response = keycloakAuthService.authenticate(email, password);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getAccessToken()).isEqualTo("access-token-123");
            assertThat(response.getRefreshToken()).isEqualTo("refresh-token-456");
            assertThat(response.getTokenType()).isEqualTo("Bearer");
            assertThat(response.getExpiresIn()).isEqualTo(3600);
            assertThat(response.getRefreshExpiresIn()).isEqualTo(2592000);

            verify(restTemplate).postForEntity(anyString(), any(HttpEntity.class), eq(Map.class));
        }

        @Test
        @DisplayName("devrait envoyer les bonnes données au token endpoint")
        void authenticate_shouldSendCorrectDataToKeycloak() {
            // Given
            String email = "user@example.com";
            String password = "SecurePass123";

            Map<String, Object> keycloakResponse = new HashMap<>();
            keycloakResponse.put("access_token", "token");
            keycloakResponse.put("refresh_token", "refresh");
            keycloakResponse.put("token_type", "Bearer");
            keycloakResponse.put("expires_in", 3600);
            keycloakResponse.put("refresh_expires_in", 2592000);

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenReturn(new ResponseEntity<>(keycloakResponse, HttpStatus.OK));

            // When
            keycloakAuthService.authenticate(email, password);

            // Then
            verify(restTemplate).postForEntity(
                    eq("http://localhost:8180/realms/taskforce/protocol/openid-connect/token"),
                    any(HttpEntity.class),
                    eq(Map.class)
            );
        }

        @Test
        @DisplayName("devrait lancer exception si credentials invalides")
        void authenticate_withInvalidCredentials_shouldThrowException() {
            // Given
            String email = "wrong@example.com";
            String password = "WrongPassword";

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenThrow(new HttpClientErrorException(HttpStatus.UNAUTHORIZED, "Unauthorized"));

            // When/Then
            assertThatThrownBy(() -> keycloakAuthService.authenticate(email, password))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Erreur lors de l'authentification");
        }

        @Test
        @DisplayName("devrait lancer exception si erreur HTTP autre que 401")
        void authenticate_withHttpError_shouldThrowException() {
            // Given
            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenThrow(new HttpClientErrorException(HttpStatus.BAD_REQUEST, "Bad Request"));

            // When/Then
            assertThatThrownBy(() ->
                    keycloakAuthService.authenticate("test@example.com", "pass")
            )
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Erreur lors de l'authentification");
        }

        @Test
        @DisplayName("devrait lancer exception si erreur générale")
        void authenticate_withGeneralError_shouldThrowException() {
            // Given
            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenThrow(new RuntimeException("Network error"));

            // When/Then
            assertThatThrownBy(() ->
                    keycloakAuthService.authenticate("test@example.com", "pass")
            )
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Erreur lors de l'authentification");
        }

        @Test
        @DisplayName("devrait lancer exception si réponse vide")
        void authenticate_withEmptyResponse_shouldThrowException() {
            // Given
            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenReturn(ResponseEntity.status(HttpStatus.OK).body(null));

            // When/Then
            assertThatThrownBy(() ->
                    keycloakAuthService.authenticate("test@example.com", "pass")
            )
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Erreur lors de l'authentification");
        }
    }

    @Nested
    @DisplayName("Refresh Token Tests")
    class RefreshTokenTests {

        @Test
        @DisplayName("devrait rafraîchir le token avec succès")
        void refreshToken_withValidToken_shouldReturnNewTokens() {
            // Given
            String refreshToken = "valid-refresh-token";

            Map<String, Object> keycloakResponse = new HashMap<>();
            keycloakResponse.put("access_token", "new-access-token");
            keycloakResponse.put("refresh_token", "new-refresh-token");
            keycloakResponse.put("token_type", "Bearer");
            keycloakResponse.put("expires_in", 3600);
            keycloakResponse.put("refresh_expires_in", 2592000);

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenReturn(new ResponseEntity<>(keycloakResponse, HttpStatus.OK));

            // When
            KeycloakTokenResponse response = keycloakAuthService.refreshToken(refreshToken);

            // Then
            assertThat(response).isNotNull();
            assertThat(response.getAccessToken()).isEqualTo("new-access-token");
            assertThat(response.getRefreshToken()).isEqualTo("new-refresh-token");
            assertThat(response.getTokenType()).isEqualTo("Bearer");

            verify(restTemplate).postForEntity(anyString(), any(HttpEntity.class), eq(Map.class));
        }

        @Test
        @DisplayName("devrait envoyer les bonnes données pour refresh")
        void refreshToken_shouldSendCorrectDataToKeycloak() {
            // Given
            String refreshToken = "token-to-refresh";

            Map<String, Object> keycloakResponse = new HashMap<>();
            keycloakResponse.put("access_token", "token");
            keycloakResponse.put("refresh_token", "token");
            keycloakResponse.put("token_type", "Bearer");
            keycloakResponse.put("expires_in", 3600);
            keycloakResponse.put("refresh_expires_in", 2592000);

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenReturn(new ResponseEntity<>(keycloakResponse, HttpStatus.OK));

            // When
            keycloakAuthService.refreshToken(refreshToken);

            // Then
            verify(restTemplate).postForEntity(
                    eq("http://localhost:8180/realms/taskforce/protocol/openid-connect/token"),
                    any(HttpEntity.class),
                    eq(Map.class)
            );
        }

        @Test
        @DisplayName("devrait lancer exception si refresh token invalide")
        void refreshToken_withInvalidToken_shouldThrowException() {
            // Given
            String invalidToken = "invalid-token";

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenThrow(new RuntimeException("Invalid token"));

            // When/Then
            assertThatThrownBy(() -> keycloakAuthService.refreshToken(invalidToken))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Token de rafraîchissement invalide");
        }

        @Test
        @DisplayName("devrait lancer exception si réponse vide")
        void refreshToken_withEmptyResponse_shouldThrowException() {
            // Given
            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                    .thenReturn(ResponseEntity.status(HttpStatus.OK).body(null));

            // When/Then
            assertThatThrownBy(() -> keycloakAuthService.refreshToken("token"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Token de rafraîchissement invalide");
        }
    }

    @Nested
    @DisplayName("Revoke Token Tests")
    class RevokeTokenTests {

        @Test
        @DisplayName("devrait révoquer le token avec succès")
        void revokeToken_withValidToken_shouldRevokeToken() {
            // Given
            String refreshToken = "token-to-revoke";

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Void.class)))
                    .thenReturn(new ResponseEntity<>(HttpStatus.OK));

            // When
            keycloakAuthService.revokeToken(refreshToken);

            // Then
            verify(restTemplate).postForEntity(
                    eq("http://localhost:8180/realms/taskforce/protocol/openid-connect/logout"),
                    any(HttpEntity.class),
                    eq(Void.class)
            );
        }

        @Test
        @DisplayName("ne devrait pas lancer exception si révocation échoue")
        void revokeToken_withError_shouldNotThrowException() {
            // Given
            String refreshToken = "token-to-revoke";

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Void.class)))
                    .thenThrow(new RuntimeException("Logout failed"));

            // When/Then - Ne devrait pas lever d'exception
            keycloakAuthService.revokeToken(refreshToken);

            // Vérifier que l'endpoint a bien été appelé malgré l'erreur
            verify(restTemplate).postForEntity(anyString(), any(HttpEntity.class), eq(Void.class));
        }

        @Test
        @DisplayName("devrait gérer token déjà expiré sans erreur")
        void revokeToken_withExpiredToken_shouldHandleGracefully() {
            // Given
            String expiredToken = "expired-token";

            when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Void.class)))
                    .thenThrow(new HttpClientErrorException(HttpStatus.UNAUTHORIZED));

            // When/Then - Ne devrait pas lever d'exception
            keycloakAuthService.revokeToken(expiredToken);

            verify(restTemplate).postForEntity(anyString(), any(HttpEntity.class), eq(Void.class));
        }
    }
}
