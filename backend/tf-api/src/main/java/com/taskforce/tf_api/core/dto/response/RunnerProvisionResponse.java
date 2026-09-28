package com.taskforce.tf_api.core.dto.response;

/**
 * Identité fraîchement provisionnée pour un runner local (ADR-013), à recopier dans le {@code .env} du runner.
 *
 * <p>Le secret n'est renvoyé qu'ICI, une seule fois : il n'est pas stocké côté TaskForce et n'est plus lisible
 * ensuite. Reprovisionner régénère le secret (l'ancien cesse de fonctionner).</p>
 *
 * @param clientId     identifiant du client Keycloak (à mettre dans {@code TASKFORCE_RUNNER_CLIENT_ID})
 * @param clientSecret secret du client ({@code TASKFORCE_RUNNER_CLIENT_SECRET}), affiché une seule fois
 * @param ownerEmail   propriétaire signé dans le jeton : le runner ne réclame que les délégations de cet e-mail
 */
public record RunnerProvisionResponse(String clientId, String clientSecret, String ownerEmail) {}
