package com.taskforce.tf_api.core.service.delivery;

import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.response.RunnerTokenResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Émet le jeton machine d'un runner local (ADR-013) : échange {@code client_credentials} auprès de
 * Keycloak, <b>relayé par le backend</b>.
 *
 * <p>Pourquoi un relais : en production Keycloak n'est pas joignable de l'extérieur (seul nginx expose des
 * ports), le backend est son seul interlocuteur, exactement comme pour le login. Le runner ne connaît
 * donc qu'une URL, celle de l'API.</p>
 *
 * <p>Le relais n'est <b>pas</b> un guichet générique : il refuse tout client hors du préfixe des runners
 * (on ne peut pas s'en servir pour éprouver le secret de {@code taskforce-api}), et ne rend le jeton
 * qu'après avoir vérifié qu'il porte bien une identité de runner complète.</p>
 */
@Service
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@Slf4j
public class RunnerTokenService {

    /** Échec d'émission : un seul type, un seul message, quelle que soit la cause (pas d'oracle). */
    public static class InvalidRunnerCredentialsException extends RuntimeException {
        public InvalidRunnerCredentialsException() {
            super("Identifiants du runner invalides");
        }
    }

    private final RestTemplate restTemplate;
    private final ObjectProvider<JwtDecoder> jwtDecoder;
    private final RunnerIdentityResolver identityResolver;
    private final LocalRunnerSettings settings;
    private final String tokenUrl;

    public RunnerTokenService(
        @Qualifier("keycloakRestTemplate") RestTemplate restTemplate,
        ObjectProvider<JwtDecoder> jwtDecoder,
        RunnerIdentityResolver identityResolver,
        LocalRunnerSettings settings,
        @Value("${keycloak.url}") String keycloakUrl,
        @Value("${keycloak.realm}") String realm
    ) {
        this.restTemplate = restTemplate;
        this.jwtDecoder = jwtDecoder;
        this.identityResolver = identityResolver;
        this.settings = settings;
        this.tokenUrl = keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/token";
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    public RunnerTokenResponse issue(String clientId, String clientSecret) {
        if (clientId == null || !clientId.startsWith(settings.clientPrefix())) {
            throw new InvalidRunnerCredentialsException();
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(tokenUrl, new HttpEntity<>(form, headers), Map.class);
            Map<String, Object> body = response.getBody();
            String accessToken = body != null ? (String) body.get("access_token") : null;
            if (accessToken == null) {
                throw new InvalidRunnerCredentialsException();
            }
            // Le jeton n'est rendu que s'il porte une identité de runner complète (rôle, compte de
            // service, propriétaire) : un client préfixé mais mal provisionné ne reçoit rien.
            JwtDecoder decoder = jwtDecoder.getIfAvailable();
            if (decoder == null) {
                throw new InvalidRunnerCredentialsException();
            }
            Jwt jwt = decoder.decode(accessToken);
            RunnerIdentity identity = identityResolver.resolve(jwt);

            long expiresIn = body.get("expires_in") instanceof Number n ? n.longValue() : 60L;
            log.info("Jeton de runner émis pour {} (propriétaire {})", identity.clientId(), identity.ownerEmail());
            return new RunnerTokenResponse(accessToken, expiresIn);
        } catch (InvalidRunnerCredentialsException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Émission du jeton de runner refusée pour {} : {}", clientId, e.getMessage());
            throw new InvalidRunnerCredentialsException();
        }
    }
}
