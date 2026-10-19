package com.taskforce.tf_api.shared.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * N'accepte que les jetons Keycloak obtenus par TaskForce lui-même : ceux du client confidentiel du backend (connexion
 * par mot de passe, GitHub ou Google, renouvellement, session par passkey) et ceux des runners de Claude Code (clients
 * {@code tf-runner-*}). Un jeton du même realm obtenu par un autre client, par exemple après une connexion sur une page
 * de Keycloak, est refusé : il n'est passé ni par la double authentification de l'app ni par ses autres contrôles.
 *
 * <p>Le client se lit dans {@code azp} (partie autorisée), avec repli sur {@code client_id}, comme pour les runners.</p>
 */
public final class AuthorizedPartyValidator implements OAuth2TokenValidator<Jwt> {

    static final OAuth2Error NOT_OURS = new OAuth2Error("invalid_token", "This token was not issued to TaskForce", null);

    private final String backendClientId;
    private final String runnerClientPrefix;

    public AuthorizedPartyValidator(String backendClientId, String runnerClientPrefix) {
        this.backendClientId = backendClientId == null ? "" : backendClientId.trim();
        this.runnerClientPrefix = runnerClientPrefix == null ? "" : runnerClientPrefix.trim();
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        String client = jwt.getClaimAsString("azp");
        if (client == null || client.isBlank()) {
            client = jwt.getClaimAsString("client_id");
        }
        return isOurs(client) ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(NOT_OURS);
    }

    private boolean isOurs(String client) {
        if (client == null || client.isBlank()) {
            return false;
        }
        return (!backendClientId.isEmpty() && client.equals(backendClientId))
            || (!runnerClientPrefix.isEmpty() && client.startsWith(runnerClientPrefix) && client.length() > runnerClientPrefix.length());
    }
}
