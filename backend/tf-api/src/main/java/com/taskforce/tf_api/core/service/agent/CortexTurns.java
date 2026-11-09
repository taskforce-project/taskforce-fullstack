package com.taskforce.tf_api.core.service.agent;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.service.ai.TurnStop;

/**
 * Le tour que chaque conversation a en cours, pour pouvoir l'arrêter (R134, séance n°20). Une conversation n'a qu'un tour à
 * la fois : le compositeur garde les messages suivants dans sa file. Un tour se nomme par un identifiant que le client
 * choisit, parce qu'une conversation neuve n'a pas encore d'id quand sa première demande part.
 *
 * <p><b>En mémoire, et c'est voulu</b> : une instance du backend sert un compte (l'app desktop embarque le sien, un espace
 * web a le sien), le tour tourne sur le fil de la requête qui l'a lancé, et rien ne se partage entre deux instances.</p>
 *
 * <p>La personne n'arrête que ses propres tours. Un arrêt arrivé avant son tour (Échap juste après Entrée, les deux requêtes
 * se croisent) n'est pas perdu : le tour naît arrêté.</p>
 */
@Component
public class CortexTurns {

    /** Un arrêt qui n'a pas trouvé son tour reste valable le temps d'un croisement de requêtes. */
    private static final long EARLY_KEPT_NANOS = Duration.ofMinutes(1).toNanos();
    /** Les arrêts gardés au plus, pour qu'un client ne fasse pas grossir la table. */
    private static final int MAX_EARLY = 1_000;
    /** Le temps laissé au tour arrêté pour se finir et se garder : l'appel au modèle est coupé, un outil peut finir. */
    static final Duration STOPPED_WAIT = Duration.ofSeconds(5);

    private final Map<Key, Running> running = new ConcurrentHashMap<>();
    private final Map<Key, Long> early = new ConcurrentHashMap<>();

    private record Key(Long userId, String turn) {}

    private static final class Running {
        final TurnStop stop = new TurnStop();
        final CompletableFuture<ChatTurnResponse> outcome = new CompletableFuture<>();
    }

    /** Fait le travail d'un tour, arrêtable ; sans identifiant (un ancien client), il se fait sans pouvoir s'arrêter. */
    public ChatTurnResponse run(Long userId, String turn, Supplier<ChatTurnResponse> work) {
        if (turn == null || turn.isBlank()) return work.get();
        Key key = new Key(userId, turn);
        Running current = new Running();
        running.put(key, current);
        if (early.remove(key) != null) current.stop.ask();
        try {
            ChatTurnResponse response = TurnStop.within(current.stop, work);
            current.outcome.complete(response);
            return response;
        } catch (RuntimeException failed) {
            current.outcome.completeExceptionally(failed);
            throw failed;
        } finally {
            running.remove(key);
        }
    }

    /**
     * Arrête un tour de cette personne, et attend qu'il se soit gardé, quelques secondes au plus : ce qu'il a fait avant
     * l'arrêt, et sa conversation quand c'est la première demande. Null quand le tour n'a pas encore commencé, s'il est
     * déjà fini, ou s'il met trop longtemps : le client garde sa ligne « Stopped by you ».
     */
    public ChatTurnResponse stop(Long userId, String turn) {
        Key key = new Key(userId, turn);
        Running current = running.get(key);
        if (current == null) {
            remember(key);
            // Le tour a pu naître entre ces deux lignes, sans voir cet arrêt.
            current = running.get(key);
            if (current == null) return null;
            early.remove(key);
        }
        current.stop.ask();
        try {
            return current.outcome.get(STOPPED_WAIT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException | ExecutionException gone) {
            return null;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    private void remember(Key key) {
        long now = System.nanoTime();
        early.values().removeIf(at -> now - at > EARLY_KEPT_NANOS);
        if (early.size() < MAX_EARLY) early.put(key, now);
    }
}
