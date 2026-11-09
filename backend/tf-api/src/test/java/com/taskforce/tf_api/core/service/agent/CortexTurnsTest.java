package com.taskforce.tf_api.core.service.agent;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.service.ai.TurnStop;
import com.taskforce.tf_api.core.service.ai.TurnStoppedException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** L'arrêt d'un tour (R134) : par la personne qui l'a lancé, à tout moment, même avant qu'il ait commencé. */
@DisplayName("CortexTurns")
class CortexTurnsTest {

    private static final ChatTurnResponse DONE = new ChatTurnResponse(1L, "t", null);

    private final CortexTurns turns = new CortexTurns();

    @Test
    @DisplayName("un tour se fait, et il n'y a plus rien à arrêter une fois fini")
    void runs_then_is_gone() {
        assertThat(turns.run(7L, "t-1", () -> DONE)).isSameAs(DONE);
        assertThat(turns.stop(7L, "t-1")).isNull();
    }

    @Test
    @DisplayName("sans nom (un ancien client), le tour se fait sans pouvoir s'arrêter")
    void without_a_name() {
        assertThat(turns.run(7L, null, () -> {
            TurnStop.check();
            return DONE;
        })).isSameAs(DONE);
    }

    @Test
    @DisplayName("l'arrêt attend le tour arrêté, et rend ce qu'il est devenu")
    void stop_returns_the_stopped_turn() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicBoolean checked = new AtomicBoolean();
        CompletableFuture<ChatTurnResponse> turn = CompletableFuture.supplyAsync(() -> turns.run(7L, "t-1", () -> {
            started.countDown();
            await(release);
            try {
                TurnStop.check();
            } catch (TurnStoppedException stopped) {
                checked.set(true);
            }
            return DONE;
        }));
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        CompletableFuture<ChatTurnResponse> stopping = CompletableFuture.supplyAsync(() -> turns.stop(7L, "t-1"));
        Thread.sleep(50);
        release.countDown();

        assertThat(stopping.get(5, TimeUnit.SECONDS)).isSameAs(DONE);
        assertThat(turn.get(5, TimeUnit.SECONDS)).isSameAs(DONE);
        assertThat(checked).isTrue();
    }

    @Test
    @DisplayName("une autre personne n'arrête pas ce tour")
    void only_its_owner_stops_it() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicBoolean stopped = new AtomicBoolean();
        CompletableFuture<ChatTurnResponse> turn = CompletableFuture.supplyAsync(() -> turns.run(7L, "t-1", () -> {
            started.countDown();
            await(release);
            try {
                TurnStop.check();
            } catch (TurnStoppedException asked) {
                stopped.set(true);
            }
            return DONE;
        }));
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        assertThat(turns.stop(8L, "t-1")).isNull();
        release.countDown();
        turn.get(5, TimeUnit.SECONDS);

        assertThat(stopped).isFalse();
    }

    @Test
    @DisplayName("un arrêt arrivé avant son tour n'est pas perdu : le tour naît arrêté")
    void early_stop_is_kept() {
        assertThat(turns.stop(7L, "t-1")).isNull();

        assertThatThrownBy(() -> turns.run(7L, "t-1", () -> {
            TurnStop.check();
            return DONE;
        })).isInstanceOf(TurnStoppedException.class);
    }

    @Test
    @DisplayName("un tour en échec se dit à qui l'arrêtait, et laisse la place")
    void failed_turn_ends() {
        assertThatThrownBy(() -> turns.run(7L, "t-1", () -> {
            throw new IllegalStateException("boom");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(turns.stop(7L, "t-1")).isNull();
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
