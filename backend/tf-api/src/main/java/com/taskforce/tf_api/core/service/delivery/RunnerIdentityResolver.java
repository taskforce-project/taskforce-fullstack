package com.taskforce.tf_api.core.service.delivery;

import java.util.Collection;
import java.util.Locale;
import java.util.Map;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.shared.exception.ForbiddenException;

/**
 * Lit l'identité d'un runner local dans un jeton Keycloak de <b>compte de service</b> (ADR-013).
 *
 * <p>Un jeton de runner cumule quatre preuves, toutes signées par Keycloak : le rôle de realm
 * {@code delivery-runner}, un client préfixé {@code tf-runner-}, un sujet qui est bien le compte de
 * service de CE client (jamais une personne), et le claim qui nomme son propriétaire. Il en manque
 * une : refus.</p>
 */
@Component
public class RunnerIdentityResolver {

    private static final int MAX_CLIENT_ID_LENGTH = 100;

    private final LocalRunnerSettings settings;

    public RunnerIdentityResolver(LocalRunnerSettings settings) {
        this.settings = settings;
    }

    /**
     * Vrai dès qu'un jeton <b>ressemble</b> à un jeton de runner (une seule des preuves suffit). Volontairement
     * large : à partir de là le traitement est fail-closed, un jeton de runner mal formé est refusé au lieu
     * d'être traité comme celui d'un utilisateur.
     */
    public boolean looksLikeRunner(Jwt jwt) {
        String clientId = clientId(jwt);
        return hasRunnerRole(jwt)
            || jwt.hasClaim(settings.ownerClaim())
            || (clientId != null && clientId.startsWith(settings.clientPrefix()));
    }

    /** Identité du runner, ou {@link ForbiddenException} si une preuve manque. */
    public RunnerIdentity resolve(Jwt jwt) {
        String clientId = clientId(jwt);
        String owner = jwt.getClaimAsString(settings.ownerClaim());
        String username = jwt.getClaimAsString("preferred_username");

        boolean valid = hasRunnerRole(jwt)
            && clientId != null
            && clientId.length() <= MAX_CLIENT_ID_LENGTH
            && clientId.startsWith(settings.clientPrefix())
            && ("service-account-" + clientId).equalsIgnoreCase(username)
            && owner != null && !owner.isBlank();
        if (!valid) {
            throw new ForbiddenException("Jeton de runner invalide");
        }
        return new RunnerIdentity(clientId, owner.trim().toLowerCase(Locale.ROOT));
    }

    /** Client du jeton : {@code azp} (partie autorisée), repli sur {@code client_id}. */
    private String clientId(Jwt jwt) {
        String azp = jwt.getClaimAsString("azp");
        return (azp != null && !azp.isBlank()) ? azp : jwt.getClaimAsString("client_id");
    }

    private boolean hasRunnerRole(Jwt jwt) {
        Object realmAccess = jwt.getClaim("realm_access");
        if (realmAccess instanceof Map<?, ?> map && map.get("roles") instanceof Collection<?> roles) {
            return roles.contains(settings.runnerRole());
        }
        return false;
    }
}
