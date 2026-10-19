package com.taskforce.tf_api.core.service.webhook;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.enums.WebhookDeliveryStatus;
import com.taskforce.tf_api.core.enums.WebhookEventType;
import com.taskforce.tf_api.core.model.Webhook;
import com.taskforce.tf_api.core.model.WebhookDelivery;
import com.taskforce.tf_api.core.repository.WebhookDeliveryRepository;
import com.taskforce.tf_api.shared.security.SsrfGuard;

import lombok.extern.slf4j.Slf4j;

/**
 * Envoi des webhooks sortants (OSS-6.2). Toutes les quelques secondes, prend les envois dus, les envoie hors de
 * toute transaction (PC-022 : jamais d'appel réseau dans une transaction) et enregistre le résultat. Une réponse
 * 2xx livre l'envoi ; sinon il est retenté après 1 min, 5 min, 30 min, 2 h puis 6 h, et abandonné après la
 * sixième tentative. Le test ({@code ping}) n'est tenté qu'une fois.
 *
 * <p>En-têtes de chaque requête : {@code X-TaskForce-Event}, {@code X-TaskForce-Delivery} (identique d'une
 * tentative à l'autre), {@code X-TaskForce-Timestamp} et {@code X-TaskForce-Signature} (cf.
 * {@link WebhookSignature}). Pas de redirection suivie ; l'URL est revérifiée contre le réseau interne avant
 * chaque envoi, sauf instance qui l'autorise ({@code taskforce.webhooks.allow-private-network}).</p>
 */
@Component
@Slf4j
public class WebhookDispatcher {

    /** Attente avant les tentatives 2 à 6. */
    static final List<Duration> BACKOFF = List.of(
        Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(30), Duration.ofHours(2), Duration.ofHours(6));
    static final int MAX_ATTEMPTS = BACKOFF.size() + 1;
    /** Un envoi pris n'est proposé à personne d'autre pendant ce délai (instance arrêtée en plein envoi : repris). */
    static final Duration LEASE = Duration.ofMinutes(2);
    private static final int BATCH = 20;
    private static final int MAX_ERROR = 500;

    private final WebhookDeliveryRepository deliveries;
    private final TransactionTemplate tx;
    private final HttpClient http;
    private final Duration timeout;
    private final boolean allowPrivateNetwork;

    public WebhookDispatcher(WebhookDeliveryRepository deliveries, TransactionTemplate tx,
                             @Value("${taskforce.webhooks.timeout-ms:10000}") long timeoutMs,
                             @Value("${taskforce.webhooks.allow-private-network:false}") boolean allowPrivateNetwork) {
        this.deliveries = deliveries;
        this.tx = tx;
        this.timeout = Duration.ofMillis(timeoutMs);
        this.allowPrivateNetwork = allowPrivateNetwork;
        this.http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(Math.min(timeoutMs, 5000)))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    }

    /** URL admise pour un webhook ? Publique, ou interne sur une instance qui l'autorise. */
    public boolean isAllowed(String url) {
        return allowPrivateNetwork ? isHttpUrl(url) : SsrfGuard.isPublicHttpUrl(url);
    }

    /** Lève {@link IllegalArgumentException} (400) pour une URL refusée, comme la garde anti-SSRF. */
    public void assertAllowed(String url) {
        if (allowPrivateNetwork) {
            if (!isHttpUrl(url)) throw new IllegalArgumentException("The webhook URL must be an http(s) URL");
            return;
        }
        SsrfGuard.assertPublicHttpUrl(url);
    }

    @Scheduled(fixedDelayString = "${taskforce.webhooks.dispatch-interval-ms:5000}")
    public void dispatchDue() {
        List<Long> claimed = tx.execute(status -> {
            LocalDateTime now = LocalDateTime.now();
            List<WebhookDelivery> due = deliveries.lockDue(now, BATCH);
            due.forEach(d -> d.setNextAttemptAt(now.plus(LEASE)));
            return due.stream().map(WebhookDelivery::getId).toList();
        });
        if (claimed != null) claimed.forEach(this::deliver);
    }

    /** Une tentative pour cet envoi : lecture, requête HTTP hors transaction, résultat enregistré. */
    public void deliver(Long deliveryId) {
        Attempt attempt = tx.execute(status -> deliveries.findById(deliveryId)
            .filter(d -> d.getStatus() == WebhookDeliveryStatus.PENDING)
            .map(Attempt::of)
            .orElse(null));
        if (attempt == null) return;
        Outcome outcome = attempt.active() ? send(attempt) : Outcome.refused("The webhook is paused");
        tx.executeWithoutResult(status -> record(deliveryId, outcome));
    }

    // -------------------------------------------------------------------------

    Outcome send(Attempt a) {
        if (!isAllowed(a.url())) return Outcome.refused("URL refused: internal network address");
        long timestamp = Instant.now().getEpochSecond();
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(a.url()))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("User-Agent", "TaskForce-Webhooks/1.0")
                .header("X-TaskForce-Event", a.eventType())
                .header("X-TaskForce-Delivery", a.deliveryId().toString())
                .header("X-TaskForce-Timestamp", String.valueOf(timestamp))
                .POST(HttpRequest.BodyPublishers.ofString(a.payload(), StandardCharsets.UTF_8));
            if (a.secret() != null && !a.secret().isBlank()) {
                request.header("X-TaskForce-Signature", WebhookSignature.sign(a.secret(), timestamp, a.payload()));
            }
            int code = http.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
            return code / 100 == 2 ? Outcome.delivered(code) : Outcome.failed(code, "HTTP " + code);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Outcome.failed(null, "Interrupted");
        } catch (Exception e) {
            String reason = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return Outcome.failed(null, reason);
        }
    }

    private void record(Long deliveryId, Outcome outcome) {
        WebhookDelivery d = deliveries.findById(deliveryId).orElse(null);
        if (d == null) return; // webhook supprimé pendant l'envoi
        LocalDateTime now = LocalDateTime.now();
        d.setAttempts(d.getAttempts() + 1);
        d.setLastStatus(outcome.status());
        d.setLastError(outcome.error() == null ? null : truncate(outcome.error()));
        if (outcome.delivered()) {
            d.setStatus(WebhookDeliveryStatus.DELIVERED);
            d.setDeliveredAt(now);
        } else if (outcome.definitive() || d.getAttempts() >= maxAttempts(d)) {
            d.setStatus(WebhookDeliveryStatus.FAILED);
            log.info("Webhook delivery {} failed after {} attempt(s): {}", d.getDeliveryId(), d.getAttempts(), d.getLastError());
        } else {
            d.setNextAttemptAt(now.plus(BACKOFF.get(d.getAttempts() - 1)));
        }
        Webhook webhook = d.getWebhook();
        webhook.setLastFiredAt(now);
        webhook.setLastStatus(outcome.status());
    }

    private static int maxAttempts(WebhookDelivery d) {
        return WebhookEventType.PING.key().equals(d.getEventType()) ? 1 : MAX_ATTEMPTS;
    }

    private static String truncate(String s) {
        return s.length() <= MAX_ERROR ? s : s.substring(0, MAX_ERROR);
    }

    private static boolean isHttpUrl(String url) {
        try {
            String scheme = URI.create(url).getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** Ce qu'il faut pour une tentative, lu dans une transaction courte. */
    record Attempt(UUID deliveryId, String eventType, String payload, String url, String secret, boolean active) {
        static Attempt of(WebhookDelivery d) {
            Webhook w = d.getWebhook();
            return new Attempt(d.getDeliveryId(), d.getEventType(), d.getPayload(), w.getUrl(), w.getSecret(),
                Boolean.TRUE.equals(w.getActive()));
        }
    }

    /** Résultat d'une tentative ; {@code definitive} : inutile de retenter (URL refusée, webhook en pause). */
    record Outcome(boolean delivered, boolean definitive, Integer status, String error) {
        static Outcome delivered(int status) { return new Outcome(true, false, status, null); }
        static Outcome failed(Integer status, String error) { return new Outcome(false, false, status, error); }
        static Outcome refused(String error) { return new Outcome(false, true, null, error); }
    }
}
