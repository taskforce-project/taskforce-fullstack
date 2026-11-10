package com.taskforce.tf_api.core.service.ai;

import java.time.Duration;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * Le temps qu'a une action pour obtenir ses réponses du modèle, dans ce fil (R142, séance n°20) : un cas du banc a son propre
 * budget, pas le délai général de l'IA ({@code AI_TIMEOUT}), réglé pour une personne qui attend une réponse. Une boucle d'outils
 * appelle le modèle plusieurs fois : le budget vaut pour le tout, chaque appel reçoit ce qu'il en reste. Hors de l'action, la
 * passerelle reprend le délai des réglages.
 */
public final class ModelDeadline {

    private static final ThreadLocal<Long> DEADLINE_NANOS = new ThreadLocal<>();

    private ModelDeadline() {
    }

    /** Ce qu'il reste du budget de l'action en cours dans ce fil, zéro ou moins quand il est épuisé ; vide hors d'une action. */
    public static Optional<Duration> remaining() {
        Long deadline = DEADLINE_NANOS.get();
        return deadline == null ? Optional.empty() : Optional.of(Duration.ofNanos(deadline - System.nanoTime()));
    }

    /** Fait {@code action} avec ce budget pour tous ses appels au modèle. */
    public static <T> T within(Duration budget, Supplier<T> action) {
        Long before = DEADLINE_NANOS.get();
        DEADLINE_NANOS.set(System.nanoTime() + budget.toNanos());
        try {
            return action.get();
        } finally {
            if (before == null) DEADLINE_NANOS.remove();
            else DEADLINE_NANOS.set(before);
        }
    }
}
