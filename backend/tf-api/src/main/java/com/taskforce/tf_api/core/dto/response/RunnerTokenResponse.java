package com.taskforce.tf_api.core.dto.response;

/**
 * Jeton machine d'un runner local (ADR-013).
 *
 * @param accessToken jeton d'accès Keycloak du compte de service (jamais de refresh token : le runner
 *                    redemande un jeton avec son secret quand celui-ci expire)
 * @param expiresIn   durée de validité, en secondes
 */
public record RunnerTokenResponse(String accessToken, long expiresIn) {}
