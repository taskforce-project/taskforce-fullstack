package com.taskforce.tf_api.core.service.agent;

import com.taskforce.tf_api.core.service.ai.ModelFailure;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Ce que dit une mesure quand le modèle qu'elle nomme n'a rien rendu à noter (R133, R142) : un cas du banc, une capacité, un
 * cas de la banque de tests, une réponse de l'essai à l'aveugle. La cause d'abord, telle que la passerelle l'a sue
 * ({@link ModelFailure}), puis ce que la personne peut faire. « stopped answering on this machine » disait la même chose d'un
 * modèle désinstallé, d'une carte graphique pleine et d'un Ollama éteint ; le 16/11/2026, il le disait d'un modèle à qui rien
 * n'avait été demandé. Le détail reste au journal : ni code d'erreur, ni adresse.
 */
final class ModelRunFailure {

    /** Le code de l'erreur, que l'écran lit comme avant : le modèle n'a pas répondu, sans note, et le cas se rejouera. */
    static final String CODE = "MODEL_FAILED";

    private ModelRunFailure() {
    }

    /**
     * L'erreur d'une mesure sans réponse à noter.
     *
     * @param model le modèle à nommer ; {@code null} pour ne pas le nommer (l'essai à l'aveugle ne dit aucun nom)
     * @param then  ce que la personne peut faire ensuite, en une phrase
     */
    static BusinessException of(String model, RuntimeException failure, String then) {
        return new BusinessException(CODE, cause(model, ModelFailure.of(failure)) + " " + then);
    }

    /** Ce qui s'est passé, en une phrase ; un modèle trop lent n'arrive pas ici, il a son verdict (« Too slow here »). */
    static String cause(String model, ModelFailure failure) {
        boolean named = model != null && !model.isBlank();
        String subject = named ? model : "This model";
        String object = named ? model : "this model";
        return switch (failure.why()) {
            case UNREACHABLE -> "The AI doesn't answer. Check that it is running.";
            case MODEL_MISSING -> "The AI of this instance doesn't serve " + object + " any more.";
            case OUT_OF_MEMORY -> subject + " doesn't fit in this machine's memory right now.";
            case TOO_LARGE -> "This request is too large for " + object + ".";
            case RATE_LIMITED -> "The AI provider is limiting requests right now.";
            case NO_CREDIT -> "The AI provider has no credit left on this account.";
            case KEY_REFUSED -> "The AI provider refused the API key. Check it in the AI settings.";
            case PROVIDER_ERROR -> "The AI had an error while " + object + " was answering.";
            case TIMEOUT, OTHER -> subject + " stopped answering on this machine.";
        };
    }
}
