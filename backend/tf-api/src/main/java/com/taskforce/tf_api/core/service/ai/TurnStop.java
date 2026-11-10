package com.taskforce.tf_api.core.service.ai;

import java.util.concurrent.Future;
import java.util.function.Supplier;

/**
 * L'arrêt d'un tour de Cortex (R134, séance n°20 : « je peux pas stopper les prompts en envoie ») : la personne clique sur
 * le carré, ou Échap, et le serveur s'arrête vraiment. Avant chaque appel au modèle, le tour regarde s'il doit s'arrêter
 * ({@link #check}) ; l'appel HTTP en cours est coupé ({@link #ask}), et le fournisseur cesse de calculer.
 *
 * <p>Il vaut pour le fil du tour, comme {@link ChosenModel} : hors d'un tour (le banc, une mesure, un résumé hors chat), il
 * n'y a rien à arrêter, et rien ne change.</p>
 */
public final class TurnStop {

    private static final ThreadLocal<TurnStop> CURRENT = new ThreadLocal<>();

    private volatile boolean asked;
    private volatile Future<?> call;

    /** Fait {@code action} dans ce tour : ses appels au modèle s'y arrêtent. */
    public static <T> T within(TurnStop stop, Supplier<T> action) {
        TurnStop before = CURRENT.get();
        CURRENT.set(stop);
        try {
            return action.get();
        } finally {
            if (before == null) CURRENT.remove();
            else CURRENT.set(before);
        }
    }

    /** Le contrôle d'avant chaque appel au modèle : la personne a arrêté ce tour, rien ne part. */
    public static void check() {
        TurnStop stop = CURRENT.get();
        if (stop != null && stop.asked) throw new TurnStoppedException();
    }

    /** L'appel HTTP en cours de ce fil ; il est coupé tout de suite si la personne a déjà arrêté. */
    public static void watch(Future<?> call) {
        TurnStop stop = CURRENT.get();
        if (stop == null) return;
        stop.call = call;
        if (stop.asked) call.cancel(true);
    }

    /** L'appel est fini : un arrêt suivant ne le touche plus. */
    public static void done() {
        TurnStop stop = CURRENT.get();
        if (stop != null) stop.call = null;
    }

    /** La personne arrête ce tour : les appels suivants ne partent pas, celui en cours est coupé. */
    public void ask() {
        asked = true;
        Future<?> running = call;
        if (running != null) running.cancel(true);
    }

    public boolean asked() {
        return asked;
    }
}
