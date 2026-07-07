package com.taskforce.tf_api.core.dto.response;

/**
 * Réponse du endpoint « connect » d'une intégration : l'URL d'autorisation OAuth
 * vers laquelle le front doit naviguer (via {@code window.location.href}).
 */
public record ConnectUrlResponse(String authorizeUrl) {
}
