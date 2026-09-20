package com.taskforce.tf_api.core.service.delivery;

/**
 * Identité machine d'un runner local (ADR-013), lue dans un jeton de compte de service Keycloak.
 *
 * @param clientId   client Keycloak du runner (claim {@code azp}), ex. {@code tf-runner-pierre}
 * @param ownerEmail propriétaire du runner, en minuscules : claim signé posé par Keycloak. Le runner
 *                   n'agit que pour cette personne, et seulement sur les runs qu'elle a délégués.
 */
public record RunnerIdentity(String clientId, String ownerEmail) {}
