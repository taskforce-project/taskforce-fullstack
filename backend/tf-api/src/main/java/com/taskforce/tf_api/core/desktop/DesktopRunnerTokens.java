package com.taskforce.tf_api.core.desktop;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.RunnerTokenResponse;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerTokenIssuer;
import com.taskforce.tf_api.shared.security.BearerTokenAuthenticator;

import lombok.extern.slf4j.Slf4j;

/**
 * Jetons du runner de Claude Code dans l'app desktop. La coque lance le runner avec un secret tiré à chaque lancement
 * ({@code desktop.runner-secret}) ; le runner l'échange ici, comme sur le serveur, contre un jeton {@code tfr_...}
 * d'une heure. Ce jeton porte la même identité qu'un jeton Keycloak de runner (rôle, client {@code tf-runner-desktop},
 * compte de service, propriétaire = le compte connecté) : {@code RunnerIdentityResolver}, le filtre de session
 * déléguée et le serveur MCP le traitent sans savoir qu'ils tournent sur un poste.
 *
 * <p>Seule l'empreinte des jetons est gardée, en mémoire : un redémarrage de l'app les invalide tous, le runner en
 * redemande un. Il n'ouvre pas le temps réel, réservé à la fenêtre de l'app.</p>
 */
@Component
@Profile("desktop")
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@Slf4j
public class DesktopRunnerTokens implements RunnerTokenIssuer, BearerTokenAuthenticator {

    /** Préfixe des jetons de runner de l'app desktop. */
    public static final String TOKEN_PREFIX = "tfr_";

    /** Durée de vie d'un jeton : au-delà du délai d'un agent (45 min) et de la marge que le runner garde (3 min). */
    static final long TOKEN_TTL_SECONDS = 3600;

    private final DesktopProperties properties;
    private final LocalRunnerSettings settings;
    private final byte[] secret;
    private final SecureRandom random = new SecureRandom();
    /** Empreinte SHA-256 de chaque jeton émis, et sa fin de validité. */
    private final Map<String, Instant> tokens = new ConcurrentHashMap<>();

    public DesktopRunnerTokens(DesktopProperties properties, LocalRunnerSettings settings,
                               @Value("${desktop.runner-secret:}") String secret) {
        this.properties = properties;
        this.settings = settings;
        this.secret = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    }

    /** Le seul client admis : le runner que la coque lance. */
    public String clientId() {
        return settings.clientPrefix() + "desktop";
    }

    @Override
    public RunnerTokenResponse issue(String clientId, String clientSecret) {
        boolean valid = secret.length > 0
            && clientId().equals(clientId)
            && clientSecret != null
            && MessageDigest.isEqual(secret, clientSecret.getBytes(StandardCharsets.UTF_8));
        if (!valid) {
            throw new InvalidRunnerCredentialsException();
        }
        Instant now = Instant.now();
        tokens.values().removeIf(expiry -> expiry.isBefore(now));
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = TOKEN_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.put(fingerprint(token), now.plusSeconds(TOKEN_TTL_SECONDS));
        log.info("Jeton du runner de l'app émis pour {}", clientId);
        return new RunnerTokenResponse(token, TOKEN_TTL_SECONDS);
    }

    @Override
    public boolean supports(String token) {
        return token != null && token.startsWith(TOKEN_PREFIX);
    }

    @Override
    public Authentication authenticate(String token) {
        Instant expiry = tokens.get(fingerprint(token));
        Instant now = Instant.now();
        if (expiry == null || expiry.isBefore(now)) {
            throw new InvalidBearerTokenException("Invalid runner token");
        }
        String serviceAccount = "service-account-" + clientId();
        Jwt jwt = Jwt.withTokenValue("desktop-runner-token")
            .header("alg", "none")
            .subject(serviceAccount)
            .claim("azp", clientId())
            .claim("preferred_username", serviceAccount)
            .claim("realm_access", Map.of("roles", List.of(settings.runnerRole())))
            .claim(settings.ownerClaim(), properties.account().email())
            .issuedAt(expiry.minusSeconds(TOKEN_TTL_SECONDS))
            .expiresAt(expiry)
            .build();
        return new JwtAuthenticationToken(jwt, List.of(), serviceAccount);
    }

    private static String fingerprint(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
