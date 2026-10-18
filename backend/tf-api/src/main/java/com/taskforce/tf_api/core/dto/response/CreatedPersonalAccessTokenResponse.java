package com.taskforce.tf_api.core.dto.response;

/**
 * Réponse à la création d'un jeton personnel : la seule fois où sa valeur sort du serveur.
 *
 * @param token le jeton tel que la liste le montrera
 * @param value le jeton complet ({@code tfp_...}), à copier tout de suite
 */
public record CreatedPersonalAccessTokenResponse(PersonalAccessTokenResponse token, String value) {}
