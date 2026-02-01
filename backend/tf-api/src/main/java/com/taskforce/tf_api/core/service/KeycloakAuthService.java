package com.taskforce.tf_api.core.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Service pour l'authentification via Keycloak OAuth2/OpenID Connect
 *
 * Flow: Resource Owner Password Credentials Grant (Direct Access)
 *
 * 1. Frontend → API Backend : { email, password }
 * 2. API Backend → Keycloak Token Endpoint : grant_type=password
 * 3. Keycloak → API Backend : { access_token, refresh_token, ... }
 * 4. API Backend → Frontend : { JWT custom tokens }
 *
 * Avantages:
 * - Formulaire de login custom (pas de redirection Keycloak)
 * - Contrôle total du flow d'authentification
 * - Tokens Keycloak validés côté backend
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class KeycloakAuthService {

    @Qualifier("keycloakRestTemplate")
    private final RestTemplate restTemplate;

    @Value("${keycloak.url}")
    private String keycloakUrl;

    @Value("${keycloak.realm}")
    private String realm;

    @Value("${keycloak.client-id}")
    private String clientId;

    @Value("${keycloak.client-secret}")
    private String clientSecret;

    /**
     * Authentifie un utilisateur via Keycloak et récupère les tokens OAuth2
     *
     * @param email Email de l'utilisateur
     * @param password Mot de passe de l'utilisateur
     * @return TokenResponse contenant les tokens OAuth2
     * @throws RuntimeException si l'authentification échoue
     */
    public KeycloakTokenResponse authenticate(String email, String password) {
        log.info("Authentification de l'utilisateur via Keycloak : {}", email);

        String tokenUrl = keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/token";

        // Préparer les paramètres de la requête
        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("grant_type", "password");
        params.add("username", email);
        params.add("password", password);
        params.add("client_id", clientId);
        params.add("client_secret", clientSecret);

        // Préparer les headers
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(params, headers);

        try {
            // Appeler l'endpoint de token Keycloak
            ResponseEntity<Map> response = restTemplate.postForEntity(tokenUrl, request, Map.class);

            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                Map<String, Object> body = response.getBody();

                KeycloakTokenResponse tokenResponse = KeycloakTokenResponse.builder()
                    .accessToken((String) body.get("access_token"))
                    .refreshToken((String) body.get("refresh_token"))
                    .tokenType((String) body.get("token_type"))
                    .expiresIn(((Number) body.get("expires_in")).intValue())
                    .refreshExpiresIn(((Number) body.get("refresh_expires_in")).intValue())
                    .build();

                log.info("Authentification réussie pour : {}", email);
                return tokenResponse;
            } else {
                throw new RuntimeException("Échec de l'authentification Keycloak");
            }

        } catch (HttpClientErrorException.Unauthorized e) {
            log.error("Échec d'authentification pour {} : credentials invalides", email);
            throw new RuntimeException("Email ou mot de passe incorrect");

        } catch (HttpClientErrorException e) {
            log.error("Erreur HTTP lors de l'authentification : {}", e.getMessage());
            throw new RuntimeException("Erreur lors de l'authentification : " + e.getMessage());

        } catch (Exception e) {
            log.error("Erreur lors de l'authentification Keycloak : {}", e.getMessage());
            throw new RuntimeException("Erreur lors de l'authentification");
        }
    }

    /**
     * Rafraîchit un token d'accès
     *
     * @param refreshToken Token de rafraîchissement
     * @return Nouveau token d'accès
     */
    public KeycloakTokenResponse refreshToken(String refreshToken) {
        log.info("Rafraîchissement du token d'accès via Keycloak");

        String tokenUrl = keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/token";

        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("grant_type", "refresh_token");
        params.add("refresh_token", refreshToken);
        params.add("client_id", clientId);
        params.add("client_secret", clientSecret);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(params, headers);

        try {
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.postForEntity(tokenUrl, request, Map.class);

            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> body = response.getBody();

                return KeycloakTokenResponse.builder()
                    .accessToken((String) body.get("access_token"))
                    .refreshToken((String) body.get("refresh_token"))
                    .tokenType((String) body.get("token_type"))
                    .expiresIn(((Number) body.get("expires_in")).intValue())
                    .refreshExpiresIn(((Number) body.get("refresh_expires_in")).intValue())
                    .build();
            } else {
                throw new RuntimeException("Échec du rafraîchissement du token");
            }

        } catch (Exception e) {
            log.error("Erreur lors du rafraîchissement du token : {}", e.getMessage());
            throw new RuntimeException("Token de rafraîchissement invalide");
        }
    }

    /**
     * Révoque un token (logout)
     *
     * @param refreshToken Token à révoquer
     */
    public void revokeToken(String refreshToken) {
        log.info("Révocation du token Keycloak");

        String logoutUrl = keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/logout";

        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("client_id", clientId);
        params.add("client_secret", clientSecret);
        params.add("refresh_token", refreshToken);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(params, headers);

        try {
            restTemplate.postForEntity(logoutUrl, request, Void.class);
            log.info("Token révoqué avec succès");

        } catch (Exception e) {
            log.error("Erreur lors de la révocation du token : {}", e.getMessage());
            // Ne pas lever d'exception, car le token peut déjà être expiré
        }
    }
}
