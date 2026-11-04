package com.taskforce.tf_api.core.service.ai;

import java.util.Optional;
import java.util.function.Supplier;

/**
 * Le modèle que la personne a choisi pour ce qu'elle demande en ce moment (R113, R118) : celui qu'elle a pris dans les
 * réglages, ou celui vers lequel elle envoie une demande d'un clic. Il remplace, le temps de l'action et dans ce fil, le
 * modèle de chaque palier (rapide, standard, raisonné) ; hors de l'action, la passerelle reprend les modèles de
 * l'instance. TaskForce ne pose jamais ce choix seul : il le propose, la personne le fait.
 */
public final class ChosenModel {

    private static final ThreadLocal<String> CHOSEN = new ThreadLocal<>();

    private ChosenModel() {
    }

    /** Le modèle choisi pour l'action en cours dans ce fil, ou vide. */
    public static Optional<String> current() {
        return Optional.ofNullable(CHOSEN.get());
    }

    /** Fait {@code action} avec {@code model} ; un modèle vide laisse ceux de l'instance. */
    public static <T> T using(String model, Supplier<T> action) {
        if (model == null || model.isBlank()) {
            return action.get();
        }
        String before = CHOSEN.get();
        CHOSEN.set(model.strip());
        try {
            return action.get();
        } finally {
            if (before == null) CHOSEN.remove();
            else CHOSEN.set(before);
        }
    }
}
