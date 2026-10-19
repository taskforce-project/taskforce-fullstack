package com.taskforce.tf_api.core.service.webhook;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.sun.net.httpserver.HttpServer;
import com.taskforce.tf_api.core.enums.WebhookDeliveryStatus;
import com.taskforce.tf_api.core.model.Webhook;
import com.taskforce.tf_api.core.model.WebhookDelivery;
import com.taskforce.tf_api.core.repository.WebhookDeliveryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires de {@link WebhookDispatcher}, contre un vrai serveur HTTP local (JDK {@link HttpServer}) : en-têtes
 * et signature reçus, puis le sort de l'envoi selon la réponse (livré, retenté, abandonné).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("WebhookDispatcher")
class WebhookDispatcherTest {

    private static final String SECRET = "whsec_test";
    private static final String BODY = "{\"type\":\"issue.created\"}";

    @Mock private WebhookDeliveryRepository deliveries;

    private HttpServer server;
    private String url;
    private volatile int answer = 204;
    private final AtomicInteger calls = new AtomicInteger();
    private final Map<String, String> received = new ConcurrentHashMap<>();
    private WebhookDispatcher dispatcher;   // réseau privé admis : le serveur de test écoute sur 127.0.0.1
    private WebhookDispatcher guarded;      // comportement par défaut

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hook", exchange -> {
            calls.incrementAndGet();
            exchange.getRequestHeaders().forEach((k, v) -> received.put(k.toLowerCase(), v.get(0)));
            received.put("body", new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(answer, -1);
            exchange.close();
        });
        server.start();
        url = "http://127.0.0.1:" + server.getAddress().getPort() + "/hook";
        TransactionTemplate tx = new TransactionTemplate(mock(PlatformTransactionManager.class));
        dispatcher = new WebhookDispatcher(deliveries, tx, 2000L, true);
        guarded = new WebhookDispatcher(deliveries, tx, 2000L, false);
    }

    @AfterEach
    void stop() {
        server.stop(0); // sans effet si un test l'a déjà arrêté
    }

    private WebhookDelivery pending(String target, String eventType, int attempts, boolean active) {
        Webhook webhook = Webhook.builder().id(1L).url(target).secret(SECRET).active(active).build();
        WebhookDelivery d = WebhookDelivery.builder().id(10L).webhook(webhook).deliveryId(UUID.randomUUID())
            .eventType(eventType).payload(BODY).attempts(attempts).nextAttemptAt(LocalDateTime.now()).build();
        when(deliveries.findById(10L)).thenReturn(Optional.of(d));
        return d;
    }

    @Test
    @DisplayName("2xx : livré, avec les en-têtes et une signature que le destinataire peut vérifier")
    void delivers_with_headers_and_signature() {
        WebhookDelivery d = pending(url, "issue.created", 0, true);

        dispatcher.deliver(10L);

        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.DELIVERED);
        assertThat(d.getAttempts()).isEqualTo(1);
        assertThat(d.getLastStatus()).isEqualTo(204);
        assertThat(d.getDeliveredAt()).isNotNull();
        assertThat(d.getWebhook().getLastStatus()).isEqualTo(204);
        assertThat(received.get("body")).isEqualTo(BODY);
        assertThat(received.get("x-taskforce-event")).isEqualTo("issue.created");
        assertThat(received.get("x-taskforce-delivery")).isEqualTo(d.getDeliveryId().toString());
        long timestamp = Long.parseLong(received.get("x-taskforce-timestamp"));
        assertThat(received.get("x-taskforce-signature")).isEqualTo(WebhookSignature.sign(SECRET, timestamp, BODY));
        assertThat(received.get("content-type")).isEqualTo("application/json");
    }

    @Test
    @DisplayName("réponse 500 : retenté une minute plus tard, code et erreur gardés")
    void retries_after_a_failure() {
        answer = 500;
        WebhookDelivery d = pending(url, "issue.created", 0, true);

        dispatcher.deliver(10L);

        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.PENDING);
        assertThat(d.getAttempts()).isEqualTo(1);
        assertThat(d.getLastStatus()).isEqualTo(500);
        assertThat(d.getLastError()).isEqualTo("HTTP 500");
        assertThat(d.getNextAttemptAt()).isCloseTo(LocalDateTime.now().plusMinutes(1), within(5, ChronoUnit.SECONDS));
    }

    @Test
    @DisplayName("sixième échec : abandonné")
    void gives_up_after_the_last_attempt() {
        answer = 503;
        WebhookDelivery d = pending(url, "issue.created", WebhookDispatcher.MAX_ATTEMPTS - 1, true);

        dispatcher.deliver(10L);

        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.FAILED);
        assertThat(d.getAttempts()).isEqualTo(WebhookDispatcher.MAX_ATTEMPTS);
    }

    @Test
    @DisplayName("ping en échec : abandonné dès la première tentative")
    void ping_is_tried_once() {
        answer = 404;
        WebhookDelivery d = pending(url, "ping", 0, true);

        dispatcher.deliver(10L);

        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.FAILED);
        assertThat(d.getLastStatus()).isEqualTo(404);
    }

    @Test
    @DisplayName("serveur injoignable : pas de code HTTP, l'erreur est gardée et l'envoi retenté")
    void unreachable_server_is_retried() {
        server.stop(0);
        WebhookDelivery d = pending(url, "issue.created", 0, true);

        dispatcher.deliver(10L);

        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.PENDING);
        assertThat(d.getLastStatus()).isNull();
        assertThat(d.getLastError()).isNotBlank();
        assertThat(d.getWebhook().getLastFiredAt()).isNotNull();
    }

    @Test
    @DisplayName("webhook en pause : abandonné sans requête")
    void paused_webhook_is_not_called() {
        WebhookDelivery d = pending(url, "issue.created", 0, false);

        dispatcher.deliver(10L);

        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.FAILED);
        assertThat(d.getLastError()).contains("paused");
        assertThat(calls.get()).isZero();
    }

    @Test
    @DisplayName("adresse interne refusée sans requête quand l'instance ne l'autorise pas (anti-SSRF)")
    void internal_address_is_refused() {
        WebhookDelivery d = pending(url, "issue.created", 0, true);

        guarded.deliver(10L);

        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.FAILED);
        assertThat(d.getLastError()).contains("internal");
        assertThat(calls.get()).isZero();
        assertThatThrownBy(() -> guarded.assertAllowed(url)).isInstanceOf(IllegalArgumentException.class);
        assertThat(dispatcher.isAllowed(url)).isTrue();
        assertThat(dispatcher.isAllowed("ftp://example.com/x")).isFalse();
    }

    @Test
    @DisplayName("un envoi déjà terminé n'est pas renvoyé")
    void finished_delivery_is_skipped() {
        WebhookDelivery d = pending(url, "issue.created", 1, true);
        d.setStatus(WebhookDeliveryStatus.DELIVERED);

        dispatcher.deliver(10L);

        assertThat(calls.get()).isZero();
        assertThat(d.getAttempts()).isEqualTo(1);
    }

    @Test
    @DisplayName("planificateur : prend les envois dus, les réserve un bail, puis les envoie")
    void dispatch_claims_then_sends() {
        WebhookDelivery d = pending(url, "issue.created", 0, true);
        when(deliveries.lockDue(any(), anyInt())).thenReturn(List.of(d));

        dispatcher.dispatchDue();

        assertThat(calls.get()).isEqualTo(1);
        assertThat(d.getStatus()).isEqualTo(WebhookDeliveryStatus.DELIVERED);
    }
}
