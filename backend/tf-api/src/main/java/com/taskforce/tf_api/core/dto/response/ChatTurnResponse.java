package com.taskforce.tf_api.core.dto.response;

/**
 * Réponse d'un tour de chat Cortex : la réponse de l'agent + la conversation à laquelle il est rattaché
 * (créée à la volée si absente). Permet au front de suivre / afficher la conversation courante.
 */
public record ChatTurnResponse(
    Long conversationId,
    String title,
    AssistantAnswer answer
) {}
