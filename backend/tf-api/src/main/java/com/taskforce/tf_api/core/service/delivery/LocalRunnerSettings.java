package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Réglages du runner local de délégation (ADR-013), lus sous {@code delivery.local-runner.*}.
 *
 * <p>Désactivé par défaut : sans {@code enabled=true}, le provider {@code claude-code} reste « à venir »,
 * et ni les endpoints machine ni le filtre de session déléguée ne sont enregistrés.</p>
 */
@Component
public class LocalRunnerSettings {

    /** Propriété d'activation, partagée par tous les beans conditionnels du runner. */
    public static final String ENABLED_PROPERTY = "delivery.local-runner.enabled";

    private final boolean enabled;
    private final String runnerRole;
    private final String clientPrefix;
    private final String ownerClaim;
    private final Duration sessionTtl;
    private final Duration heartbeatTimeout;

    public LocalRunnerSettings(
        @Value("${delivery.local-runner.enabled:false}") boolean enabled,
        @Value("${delivery.local-runner.runner-role:delivery-runner}") String runnerRole,
        @Value("${delivery.local-runner.client-prefix:tf-runner-}") String clientPrefix,
        @Value("${delivery.local-runner.owner-claim:tf_runner_owner}") String ownerClaim,
        @Value("${delivery.local-runner.session-ttl-minutes:120}") long sessionTtlMinutes,
        @Value("${delivery.local-runner.heartbeat-timeout-minutes:10}") long heartbeatTimeoutMinutes
    ) {
        this.enabled = enabled;
        this.runnerRole = runnerRole;
        this.clientPrefix = clientPrefix;
        this.ownerClaim = ownerClaim;
        this.sessionTtl = Duration.ofMinutes(sessionTtlMinutes);
        this.heartbeatTimeout = Duration.ofMinutes(heartbeatTimeoutMinutes);
    }

    public boolean enabled()            { return enabled; }
    /** Rôle de realm Keycloak porté par le compte de service d'un runner. */
    public String runnerRole()          { return runnerRole; }
    /** Préfixe imposé aux clients Keycloak de runner (le proxy de jeton refuse tout autre client). */
    public String clientPrefix()        { return clientPrefix; }
    /** Claim signé qui nomme le propriétaire du runner (e-mail), posé par un mapper Keycloak. */
    public String ownerClaim()          { return ownerClaim; }
    /** Durée de vie maximale d'une session déléguée, comptée depuis le claim. */
    public Duration sessionTtl()        { return sessionTtl; }
    /** Silence au-delà duquel un runner est considéré perdu. */
    public Duration heartbeatTimeout()  { return heartbeatTimeout; }
}
