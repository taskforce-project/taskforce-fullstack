package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

/**
 * Le transport HTTP de la passerelle. Une interface pour que les tests rejouent un fournisseur sans réseau.
 */
public interface ModelHttp {

    /** Une réponse du fournisseur, quel que soit son statut ; un corps absent est vide. */
    record Reply(int status, String body) {

        public Reply {
            body = body == null ? "" : body;
        }

        public boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    /**
     * Envoie une requête ; {@code body} {@code null} pour un GET.
     *
     * @throws IOException fournisseur injoignable, délai dépassé ou adresse invalide
     */
    Reply send(String method, String url, Map<String, String> headers, String body, Duration timeout) throws IOException;

    /**
     * Le client du JDK, en HTTP/1.1 : en clair, le passage à HTTP/2 qu'il tente sinon ({@code Upgrade: h2c}) n'est
     * pas compris par tous les serveurs locaux. Le délai de connexion est court, celui de la réponse vient des réglages.
     * L'appel est asynchrone pour que l'arrêt d'un tour le coupe ({@link TurnStop}) : le fournisseur voit la connexion
     * se fermer, et cesse de calculer.
     */
    static ModelHttp jdk() {
        HttpClient client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        return (method, url, headers, body, timeout) -> {
            HttpRequest request;
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).timeout(timeout);
                headers.forEach(builder::header);
                request = builder.method(method, body == null
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
            } catch (IllegalArgumentException invalid) {
                // Adresse mal formée, ou clé qui contient un caractère interdit dans un en-tête : jamais citées.
                throw new IOException("invalid address or header");
            }
            CompletableFuture<HttpResponse<String>> call =
                client.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            TurnStop.watch(call);
            try {
                HttpResponse<String> response = call.get();
                return new Reply(response.statusCode(), response.body());
            } catch (CancellationException stopped) {
                throw new TurnStoppedException();
            } catch (ExecutionException failed) {
                // Selon où il en était, un appel coupé finit ici : si la personne a arrêté, ce n'est pas une panne.
                TurnStop.check();
                throw failed.getCause() instanceof IOException io ? io : new IOException(failed.getCause());
            } catch (InterruptedException interrupted) {
                call.cancel(true);
                Thread.currentThread().interrupt();
                throw new IOException("interrupted", interrupted);
            } finally {
                TurnStop.done();
            }
        };
    }
}
