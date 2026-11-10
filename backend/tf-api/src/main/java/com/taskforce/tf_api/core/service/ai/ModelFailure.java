package com.taskforce.tf_api.core.service.ai;

import java.time.Duration;

import com.taskforce.tf_api.core.service.ai.ModelProviderException.Why;

/**
 * Ce qui s'est passé quand un modèle n'a pas répondu, en une phrase qui dit aussi quoi faire (TF-J1-15, R133). « Sorry, I
 * couldn't answer » cachait un refus de taille, « AI unavailable » un délai dépassé : une erreur sans cause apprend
 * seulement à ne plus essayer. Jamais de code d'erreur ni d'adresse : le détail reste au journal.
 *
 * @param why     pourquoi, tel que la passerelle l'a su ; {@link Why#OTHER} sans rien de plus précis
 * @param model   le modèle appelé ; null quand il n'est pas connu
 * @param waited  le temps qu'il a eu, quand il l'a dépassé ; null sinon
 */
public record ModelFailure(Why why, String model, Duration waited) {

    /** Remonte les causes jusqu'à ce que la passerelle a su ; autre chose (un bug, un état inattendu) reste {@link Why#OTHER}. */
    public static ModelFailure of(Throwable failure) {
        for (Throwable at = failure; at != null; at = at.getCause() == at ? null : at.getCause()) {
            if (at instanceof ModelProviderException provider) {
                return new ModelFailure(provider.why(), provider.model(), provider.waited());
            }
        }
        return new ModelFailure(Why.OTHER, null, null);
    }

    /** La phrase de la conversation : ce qui s'est passé, puis ce que la personne peut faire. */
    public String said() {
        return switch (why) {
            case TIMEOUT -> name() + " took more than " + seconds() + " seconds, so it was stopped and there is no answer. "
                + "A smaller model answers faster: choose one under the message box, or shorten your request.";
            case UNREACHABLE -> "The AI provider can't be reached, so there is no answer. Check that it is running "
                + "(Ollama, if you use it) and that this instance can reach it, then ask again.";
            case RATE_LIMITED -> "The AI provider is limiting requests right now, so there is no answer. Wait a minute, then ask again.";
            case NO_CREDIT -> "The AI provider has no credit left on this account, so there is no answer. Add credit on its "
                + "site, or choose another model.";
            case KEY_REFUSED -> "The AI provider refused the API key, so there is no answer. Check the key in the AI settings.";
            case MODEL_MISSING -> name() + " isn't available from the AI provider, so there is no answer. Choose another model.";
            case TOO_LARGE -> "This request is too large for " + nameInSentence() + ", so there is no answer. Shorten it, or "
                + "choose a model with a larger context window.";
            case OUT_OF_MEMORY -> name() + " doesn't fit in this machine's memory, so there is no answer. Choose a smaller model.";
            case PROVIDER_ERROR -> "The AI provider had an error while answering, so there is no answer. Ask again in a "
                + "moment; if it keeps failing, choose another model.";
            case OTHER -> name() + " stopped before answering. Ask again in a moment; if it keeps failing, choose another model.";
        };
    }

    private String name() {
        return model == null || model.isBlank() ? "The model" : model;
    }

    private String nameInSentence() {
        return model == null || model.isBlank() ? "the model" : model;
    }

    private long seconds() {
        return waited == null ? 0 : waited.toSeconds();
    }
}
