package com.taskforce.tf_api.core.desktop;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.shared.security.BearerTokenAuthenticator;

import lombok.RequiredArgsConstructor;

/**
 * Authentifie le jeton de lancement de l'app desktop ({@code tfd_...}) : la requête agit au nom du compte connecté
 * dans la coque. Il remplace la validation des jetons Keycloak dans le profil {@code desktop} (spec §5.7) : l'API
 * n'écoute que sur 127.0.0.1 et seule la coque connaît ce jeton, tiré à chaque lancement.
 *
 * <p>Le principal est un JWT synthétique, comme pour un jeton personnel : les contrôleurs résolvent la personne par
 * le claim {@code email} et lisent son identifiant Keycloak dans {@code sub}, sans savoir qu'ils tournent sur un poste.
 * La valeur du jeton n'est pas reprise dans ce JWT.</p>
 */
@Component
@Profile("desktop")
@RequiredArgsConstructor
public class DesktopLaunchTokenAuthenticator implements BearerTokenAuthenticator {

    /** Claim posé sur le principal d'une requête de l'app desktop. */
    public static final String DESKTOP_CLAIM = "tf_desktop";

    /** Durée de vie du principal synthétique : celle de la requête, le jeton est revérifié à chaque appel. */
    private static final long PRINCIPAL_TTL_SECONDS = 300;

    private final DesktopProperties properties;

    @Override
    public boolean supports(String token) {
        return token != null && token.startsWith(DesktopProperties.LAUNCH_TOKEN_PREFIX);
    }

    /** Le temps réel de l'app passe aussi par ce jeton (connexion STOMP de la fenêtre). */
    @Override
    public boolean allowsRealtime() {
        return true;
    }

    @Override
    public Authentication authenticate(String token) {
        if (!matches(token)) {
            throw new InvalidBearerTokenException("Invalid desktop launch token");
        }
        DesktopProperties.Account account = properties.account();
        Instant now = Instant.now();
        Jwt.Builder jwt = Jwt.withTokenValue("desktop-launch-token")
            .header("alg", "none")
            .subject(account.subject())
            .claim("email", account.email())
            .claim("preferred_username", account.email())
            .claim("name", account.displayName())
            .claim(DESKTOP_CLAIM, true)
            .issuedAt(now)
            .expiresAt(now.plusSeconds(PRINCIPAL_TTL_SECONDS));
        if (account.givenName() != null && !account.givenName().isBlank()) {
            jwt.claim("given_name", account.givenName());
        }
        if (account.familyName() != null && !account.familyName().isBlank()) {
            jwt.claim("family_name", account.familyName());
        }
        return new JwtAuthenticationToken(jwt.build(), List.of(), account.email());
    }

    /** Comparaison en temps constant : la durée de la réponse ne dit rien du jeton attendu. */
    private boolean matches(String token) {
        return MessageDigest.isEqual(
            token.getBytes(StandardCharsets.UTF_8),
            properties.launchToken().getBytes(StandardCharsets.UTF_8));
    }
}
