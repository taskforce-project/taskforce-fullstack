package com.taskforce.tf_api.core.service.agent;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link ModelCallStops} : « Stop » coupe l'appel en cours de cette personne, et d'elle seule, sans rien laisser derrière lui. */
@DisplayName("ModelCallStops")
class ModelCallStopsTest {

    private final ModelCallStops stops = new ModelCallStops();

    /** Un appel qui attend, comme une réponse du modèle qui ne vient pas ; il s'annonce quand il est en route. */
    private CompletableFuture<String> waiting(long workspace, long user, CountDownLatch started) {
        return CompletableFuture.supplyAsync(() -> stops.during(workspace, user, () -> {
            started.countDown();
            try {
                Thread.sleep(30_000);
                return "answered";
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("interrupted", interrupted);
            }
        }));
    }

    @Test
    @DisplayName("un appel arrêté se dit « Stopped », tout de suite")
    void stoppingInterruptsTheCall() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CompletableFuture<String> call = waiting(1L, 7L, started);
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        stops.stop(1L, 7L);

        assertThatThrownBy(() -> call.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(ModelCallStops.Stopped.class);
    }

    @Test
    @DisplayName("« Stop » n'atteint pas les appels d'une autre personne")
    void stoppingStaysWithThePerson() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CompletableFuture<String> call = waiting(1L, 7L, started);
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        stops.stop(1L, 8L);
        stops.stop(2L, 7L);

        assertThat(call).isNotCompleted();
        stops.stop(1L, 7L);
        assertThatThrownBy(() -> call.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(ModelCallStops.Stopped.class);
    }

    @Test
    @DisplayName("sans « Stop », l'appel rend sa réponse ; une erreur reste la sienne ; le fil reste propre")
    void withoutStopNothingChanges() {
        assertThat(stops.during(1L, 7L, () -> "answered")).isEqualTo("answered");
        assertThatThrownBy(() -> stops.during(1L, 7L, () -> {
            throw new IllegalArgumentException("nope");
        })).isExactlyInstanceOf(IllegalArgumentException.class);
        assertThat(Thread.currentThread().isInterrupted()).isFalse();
    }

    @Test
    @DisplayName("arrêter quand rien ne tourne ne fait rien")
    void stoppingNothing() {
        stops.stop(1L, 7L);
        assertThat(stops.during(1L, 7L, () -> "ok")).isEqualTo("ok");
    }
}
