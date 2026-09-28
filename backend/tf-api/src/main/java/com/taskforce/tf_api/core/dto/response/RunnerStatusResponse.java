package com.taskforce.tf_api.core.dto.response;

/**
 * État du runner d'un utilisateur, sans jamais exposer de secret (ADR-013).
 *
 * @param exists      un client de runner est-il déjà provisionné pour cet utilisateur
 * @param clientId    identifiant du client (présent ou à créer)
 * @param ownerEmail  propriétaire auquel le runner serait (ou est) lié
 */
public record RunnerStatusResponse(boolean exists, String clientId, String ownerEmail) {}
