package com.taskforce.tf_api.core.service.agent;

import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Le geste ne peut pas continuer sans une réponse de la personne (R115) : TaskForce pose la question, rien n'est écrit.
 * Dans la conversation, Cortex la montre en carte ; un agent extérieur, par le serveur MCP, la lit comme une erreur
 * d'outil qui dit la question et ses choix, pour la poser à sa personne.
 */
public class QuestionNeeded extends BusinessException {

    private final transient Question question;

    public QuestionNeeded(Question question) {
        super("QUESTION_NEEDED", question.asText());
        this.question = question;
    }

    public Question question() {
        return question;
    }
}
