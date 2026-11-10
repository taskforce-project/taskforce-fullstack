package com.taskforce.tf_api.core.service;

/**
 * Le modèle n'a pas répondu dans le temps donné à la demande : il n'est ni tombé ni mauvais, il est trop lent ici. Le banc des
 * modèles en fait le verdict « Too slow here » (R142) ; ailleurs, c'est une erreur de l'IA comme une autre.
 */
public class LlmTimedOutException extends AiGatewayClient.LlmException {

    public LlmTimedOutException(String message, Throwable cause) {
        super(message, cause);
    }
}
