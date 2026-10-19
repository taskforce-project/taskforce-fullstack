package com.taskforce.tf_api.core.service.delivery;

import com.taskforce.tf_api.core.dto.response.RunnerTokenResponse;

/**
 * Émet le jeton machine d'un runner local (ADR-013) contre ses identifiants. Sur le serveur, c'est Keycloak, par le
 * relais {@link RunnerTokenService} ; dans l'app desktop, la coque lance elle-même le runner avec un secret tiré au
 * lancement ({@code DesktopRunnerTokens}).
 */
public interface RunnerTokenIssuer {

    /** Échec d'émission : un seul type, un seul message, quelle que soit la cause (pas d'oracle). */
    class InvalidRunnerCredentialsException extends RuntimeException {
        public InvalidRunnerCredentialsException() {
            super("Invalid runner credentials");
        }
    }

    /**
     * Jeton du runner {@code clientId}.
     *
     * @throws InvalidRunnerCredentialsException identifiants refusés
     */
    RunnerTokenResponse issue(String clientId, String clientSecret);
}
