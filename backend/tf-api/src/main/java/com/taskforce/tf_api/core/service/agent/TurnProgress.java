package com.taskforce.tf_api.core.service.agent;

import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Où en est la réponse de Cortex, pour la ligne de travail de la conversation (R137) : ce fil annonce ce qu'il fait au
 * moment où il le fait, jamais une suite de phases jouée d'avance. Comme {@code ChosenModel}, le temps de l'action et dans
 * ce fil : le rejeu d'un cas de la banque ou une reprise sur une carte n'annoncent rien à personne.
 */
public final class TurnProgress {

    /** Cortex cherche dans les notes. */
    public static final String NOTES = "notes";
    /** Cortex lit la demande et décide. */
    public static final String THINKING = "thinking";
    /** Ce qui reste de la conversation se condense pour tenir la fenêtre du modèle. */
    public static final String CONDENSING = "condensing";
    /** Cortex écrit sa réponse, après des outils. */
    public static final String WRITING = "writing";
    /** Un outil travaille : {@link Step#tool} le nomme, l'interface le dit en mots. */
    public static final String TOOL = "tool";

    /** Une étape : ce qu'elle est, et l'outil quand c'en est un. */
    public record Step(String step, String tool) {}

    private static final ThreadLocal<Consumer<Step>> SINK = new ThreadLocal<>();

    private TurnProgress() {
    }

    /** Fait {@code action} en envoyant ses étapes à {@code sink} ; sans {@code sink}, rien n'est annoncé. */
    public static <T> T during(Consumer<Step> sink, Supplier<T> action) {
        if (sink == null) {
            return action.get();
        }
        Consumer<Step> before = SINK.get();
        SINK.set(sink);
        try {
            return action.get();
        } finally {
            if (before == null) SINK.remove();
            else SINK.set(before);
        }
    }

    /** Annonce une étape ; une annonce qui échoue ne touche jamais la réponse. */
    public static void say(String step) {
        send(new Step(step, null));
    }

    /** Annonce l'outil qui commence. */
    public static void tool(String name) {
        send(new Step(TOOL, name));
    }

    private static void send(Step step) {
        Consumer<Step> sink = SINK.get();
        if (sink == null) return;
        try {
            sink.accept(step);
        } catch (RuntimeException ignored) {
            // La ligne de travail reste un confort : elle ne fait jamais tomber une réponse.
        }
    }
}
