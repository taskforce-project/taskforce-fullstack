package com.taskforce.tf_api.core.security;

import java.time.Instant;
import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.PersonalAccessTokenService;
import com.taskforce.tf_api.core.service.PersonalAccessTokenService.TokenPrincipal;
import com.taskforce.tf_api.shared.security.BearerTokenAuthenticator;

import lombok.RequiredArgsConstructor;

/**
 * Authentifie un jeton personnel ({@code tfp_...}, OSS-5.1) : la requête agit au nom de la personne qui l'a créé.
 *
 * <p>Le principal est un JWT synthétique, comme pour la session déléguée d'un runner : les contrôleurs résolvent la
 * personne par le claim {@code email} (repli {@code preferred_username} en dev), on pose les deux, plus
 * {@value #TOKEN_CLAIM} que {@link PersonalTokenScopeFilter} lit pour borner le jeton au serveur MCP. La valeur du
 * jeton n'est pas reprise dans ce JWT : rien en aval ne peut la journaliser ni la relayer.</p>
 */
@Component
@RequiredArgsConstructor
public class PersonalTokenAuthenticator implements BearerTokenAuthenticator {

    /** Claim posé sur le principal d'une requête authentifiée par jeton personnel (id du jeton). */
    public static final String TOKEN_CLAIM = "tf_pat";

    /** Durée de vie du principal synthétique : celle de la requête, le jeton est relu à chaque appel. */
    private static final long PRINCIPAL_TTL_SECONDS = 300;

    private final PersonalAccessTokenService tokenService;

    @Override
    public boolean supports(String token) {
        return PersonalAccessTokenService.looksLikeToken(token);
    }

    @Override
    public Authentication authenticate(String token) {
        TokenPrincipal principal = tokenService.authenticate(token)
            .orElseThrow(() -> new InvalidBearerTokenException("Invalid or revoked access token"));
        Instant now = Instant.now();
        Jwt.Builder jwt = Jwt.withTokenValue("personal-access-token")
            .header("alg", "none")
            .claim("email", principal.email())
            .claim("preferred_username", principal.email())
            .claim(TOKEN_CLAIM, principal.tokenId())
            .issuedAt(now)
            .expiresAt(now.plusSeconds(PRINCIPAL_TTL_SECONDS));
        jwt.subject(principal.keycloakId() != null ? principal.keycloakId() : "user:" + principal.userId());
        return new JwtAuthenticationToken(jwt.build(), List.of(), principal.email());
    }
}
