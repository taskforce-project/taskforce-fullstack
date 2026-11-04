package com.taskforce.tf_api.core.dto.response;

/**
 * Réponse d'un tour de chat Cortex : la réponse de l'agent + la conversation à laquelle il est rattaché
 * (créée à la volée si absente). Permet au front de suivre / afficher la conversation courante.
 *
 * <p>{@code escalation} : ce que TaskForce propose quand la banque dit que le modèle de Cortex échoue à ce genre de
 * demande et qu'un autre modèle servi le réussit (R118) ; la personne envoie la demande d'un clic, jamais TaskForce
 * seul. {@code sentTo} : le modèle vers lequel la personne a envoyé cette demande, quand elle l'a fait.</p>
 */
public record ChatTurnResponse(
    Long conversationId,
    String title,
    AssistantAnswer answer,
    Escalation escalation,
    String sentTo
) {

    public ChatTurnResponse(Long conversationId, String title, AssistantAnswer answer) {
        this(conversationId, title, answer, null, null);
    }

    /**
     * La proposition : la capacité en jeu, le modèle qui l'a échouée, celui qui l'a réussie, et la phrase que TaskForce
     * écrit dans la conversation (gardée avec la réponse).
     */
    public record Escalation(String capability, String from, String to, String text) {
    }
}
