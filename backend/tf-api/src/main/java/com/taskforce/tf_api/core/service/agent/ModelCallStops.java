package com.taskforce.tf_api.core.service.agent;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * « Stop » du banc des modèles (R142) : un cas a jusqu'à cinq minutes, et la personne qui arrête ne doit pas les attendre, ni
 * laisser le modèle occupé. Chaque appel au modèle d'un passage s'inscrit ici, sous la personne et l'espace ; {@link #stop}
 * interrompt son fil, ce qui coupe la connexion au fournisseur (Ollama abandonne alors sa réponse).
 */
@Component
public class ModelCallStops {

    /** Un appel arrêté par la personne : rien n'est noté, le cas se rejouera. */
    public static final class Stopped extends BusinessException {
        Stopped() {
            super("MODEL_RUN_STOPPED", "Stopped.");
        }
    }

    private record Owner(Long workspaceId, Long userId) {
    }

    private final Map<Owner, Set<Thread>> calls = new ConcurrentHashMap<>();

    /** Fait {@code call}, qu'un {@link #stop} de cette personne peut interrompre. */
    public <T> T during(Long workspaceId, Long userId, Supplier<T> call) {
        Owner owner = new Owner(workspaceId, userId);
        Thread me = Thread.currentThread();
        calls.computeIfAbsent(owner, key -> ConcurrentHashMap.newKeySet()).add(me);
        try {
            return call.get();
        } catch (RuntimeException failed) {
            if (me.isInterrupted()) throw new Stopped();
            throw failed;
        } finally {
            calls.computeIfPresent(owner, (key, threads) -> {
                threads.remove(me);
                return threads.isEmpty() ? null : threads;
            });
            // Le fil retourne au pool du serveur : une interruption arrivée à la toute fin ne doit pas le suivre.
            Thread.interrupted();
        }
    }

    /** Interrompt les appels au modèle en cours de cette personne dans cet espace ; rien s'il n'y en a pas. */
    public void stop(Long workspaceId, Long userId) {
        Set<Thread> threads = calls.get(new Owner(workspaceId, userId));
        if (threads != null) threads.forEach(Thread::interrupt);
    }
}
