package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * L'arrêt d'un tour coupe vraiment l'appel au fournisseur (R134) : un petit serveur local joue le fournisseur qui calcule
 * longtemps, et voit la connexion se fermer.
 */
@DisplayName("TurnStop")
class TurnStopTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    private HttpServer server;
    private ExecutorService executor;
    private String url;
    private final CountDownLatch answering = new CountDownLatch(1);
    private final CountDownLatch release = new CountDownLatch(1);
    private final AtomicBoolean clientGone = new AtomicBoolean();

    @BeforeEach
    void provider() throws IOException {
        executor = Executors.newCachedThreadPool();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        server.createContext("/slow", exchange -> {
            answering.countDown();
            exchange.sendResponseHeaders(200, 0);
            try (OutputStream body = exchange.getResponseBody()) {
                // Il écrit jusqu'à ce que la connexion se ferme, ou qu'on le libère.
                for (int i = 0; i < 400 && !release.await(25, TimeUnit.MILLISECONDS); i++) {
                    body.write("x".repeat(4096).getBytes(StandardCharsets.UTF_8));
                    body.flush();
                }
            } catch (IOException gone) {
                clientGone.set(true);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        });
        server.createContext("/ok", exchange -> {
            byte[] bytes = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        url = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopProvider() {
        release.countDown();
        server.stop(0);
        executor.shutdownNow();
    }

    @Test
    @DisplayName("sans arrêt, l'appel répond comme avant, dans un tour comme hors d'un tour")
    void answers() throws IOException {
        ModelHttp http = ModelHttp.jdk();

        assertThat(http.send("GET", url + "/ok", Map.of(), null, TIMEOUT).body()).isEqualTo("{\"ok\":true}");
        ModelHttp.Reply within = TurnStop.within(new TurnStop(), () -> {
            try {
                return http.send("GET", url + "/ok", Map.of(), null, TIMEOUT);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(within.ok()).isTrue();
    }

    @Test
    @DisplayName("un fournisseur injoignable reste une panne de transport")
    void unreachable_stays_an_io_failure() {
        ModelHttp http = ModelHttp.jdk();

        assertThatThrownBy(() -> http.send("GET", "http://127.0.0.1:1/none", Map.of(), null, Duration.ofSeconds(2)))
            .isInstanceOf(IOException.class);
    }

    @Test
    @DisplayName("l'arrêt coupe l'appel en cours : le client s'arrête tout de suite, le fournisseur voit la connexion se fermer")
    void stop_cuts_the_call_in_flight() throws Exception {
        ModelHttp http = ModelHttp.jdk();
        TurnStop stop = new TurnStop();
        CompletableFuture<ModelHttp.Reply> call = CompletableFuture.supplyAsync(() -> TurnStop.within(stop, () -> {
            try {
                return http.send("GET", url + "/slow", Map.of(), null, TIMEOUT);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }));
        assertThat(answering.await(5, TimeUnit.SECONDS)).isTrue();

        stop.ask();

        assertThatThrownBy(() -> call.get(5, TimeUnit.SECONDS))
            .isInstanceOf(ExecutionException.class)
            .hasCauseInstanceOf(TurnStoppedException.class);
        for (int i = 0; i < 200 && !clientGone.get(); i++) Thread.sleep(25);
        assertThat(clientGone).as("le fournisseur voit la connexion se fermer").isTrue();
        assertThat(stop.asked()).isTrue();
    }

    @Test
    @DisplayName("arrêté avant l'appel : le contrôle l'empêche de partir, et un appel lancé quand même est coupé")
    void stopped_before_the_call() {
        ModelHttp http = ModelHttp.jdk();
        TurnStop stop = new TurnStop();
        stop.ask();

        assertThatThrownBy(() -> TurnStop.within(stop, () -> {
            TurnStop.check();
            return "unreachable";
        })).isInstanceOf(TurnStoppedException.class);
        assertThatThrownBy(() -> TurnStop.within(stop, () -> {
            try {
                return http.send("GET", url + "/slow", Map.of(), null, TIMEOUT);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        })).isInstanceOf(TurnStoppedException.class);
    }

    @Test
    @DisplayName("hors d'un tour, le contrôle ne fait rien ; un tour imbriqué rend le précédent")
    void outside_a_turn_and_nesting() {
        TurnStop.check();
        TurnStop.watch(CompletableFuture.completedFuture(null));
        TurnStop.done();

        TurnStop outer = new TurnStop();
        TurnStop inner = new TurnStop();
        inner.ask();
        TurnStop.within(outer, () -> {
            assertThatThrownBy(() -> TurnStop.within(inner, () -> {
                TurnStop.check();
                return null;
            })).isInstanceOf(TurnStoppedException.class);
            TurnStop.check();
            return null;
        });
    }
}
