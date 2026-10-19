package com.taskforce.tf_api.core.service.webhook;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.WebhookEventType;
import com.taskforce.tf_api.core.model.Webhook;
import com.taskforce.tf_api.core.model.WebhookDelivery;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WebhookDeliveryRepository;
import com.taskforce.tf_api.core.repository.WebhookRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * File d'envoi des webhooks sortants (OSS-6.2, ADR-020) : transforme un {@link WorkspaceWebhookEvent} en un envoi
 * par webhook abonné, écrit <b>dans la transaction</b> qui a produit l'événement, juste avant son commit. Un
 * changement annulé n'envoie donc rien, et un changement validé a toujours ses envois ; le
 * {@link WebhookDispatcher} les envoie ensuite, hors transaction.
 *
 * <p>Corps envoyé, le même pour tous les webhooks d'un événement :</p>
 * <pre>{"id": "evt_…", "type": "issue.created", "createdAt": "…Z", "url": "https://…/acme/projects/3/issues/42",
 *  "workspace": {"id", "slug", "name"}, "actor": {"id", "name"}, "data": {"issue": {…}}}</pre>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WebhookOutbox {

    private final WebhookRepository         webhookRepository;
    private final WebhookDeliveryRepository deliveryRepository;
    private final UserRepository            userRepository;
    private final ObjectMapper              objectMapper;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String appUrl;

    /**
     * Un envoi par webhook actif abonné à l'événement. Avant le commit de la transaction qui publie l'événement ;
     * sans transaction en cours, tout de suite. Un corps impossible à sérialiser est journalisé et ignoré : un
     * webhook ne doit jamais faire échouer le changement qui le déclenche.
     */
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    public void onEvent(WorkspaceWebhookEvent event) {
        List<Webhook> targets = webhookRepository.findByWorkspaceIdAndActiveTrue(event.workspaceId()).stream()
            .filter(w -> subscribed(w, event.type()))
            .toList();
        if (targets.isEmpty()) return;
        String body;
        try {
            body = body(targets.get(0).getWorkspace(), event);
        } catch (Exception e) {
            log.error("Webhook event {} not queued (workspace {}): {}", event.type().key(), event.workspaceId(), e.getMessage());
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Webhook webhook : targets) enqueue(webhook, event.type(), body, now);
    }

    /**
     * Envoi de l'événement de test ({@code ping}) d'un webhook, réservé jusqu'à {@code reservedUntil} : l'appelant
     * l'envoie lui-même, le planificateur ne le prend pas entre-temps.
     */
    public WebhookDelivery enqueueTest(Webhook webhook, Long actorId, LocalDateTime reservedUntil) {
        WorkspaceWebhookEvent ping = new WorkspaceWebhookEvent(webhook.getWorkspace().getId(), WebhookEventType.PING,
            actorId, Map.of("message", "Test event sent from TaskForce"), null);
        return enqueue(webhook, WebhookEventType.PING, body(webhook.getWorkspace(), ping), reservedUntil);
    }

    // -------------------------------------------------------------------------

    private WebhookDelivery enqueue(Webhook webhook, WebhookEventType type, String body, LocalDateTime due) {
        // Chaque envoi est signé : un webhook créé avant la signature (OSS-6.2) reçoit son secret au premier envoi,
        // à régénérer dans l'écran des webhooks pour le connaître.
        if (webhook.getSecret() == null || webhook.getSecret().isBlank()) {
            webhook.setSecret(WebhookSignature.newSecret());
            webhookRepository.save(webhook);
        }
        return deliveryRepository.save(WebhookDelivery.builder()
            .webhook(webhook)
            .deliveryId(UUID.randomUUID())
            .eventType(type.key())
            .payload(body)
            .nextAttemptAt(due)
            .build());
    }

    /** Aucun type choisi = tous les événements ; {@code ping} n'est envoyé qu'à la demande. */
    private static boolean subscribed(Webhook webhook, WebhookEventType type) {
        if (type == WebhookEventType.PING) return false;
        String[] types = webhook.getEventTypes();
        return types == null || types.length == 0 || Arrays.asList(types).contains(type.key());
    }

    private String body(Workspace workspace, WorkspaceWebhookEvent event) {
        Map<String, Object> ws = new LinkedHashMap<>();
        ws.put("id", workspace.getId());
        ws.put("slug", workspace.getSlug());
        ws.put("name", workspace.getName());

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("id", "evt_" + UUID.randomUUID());
        envelope.put("type", event.type().key());
        envelope.put("createdAt", Instant.now().toString());
        if (event.path() != null) envelope.put("url", stripTrailingSlash(appUrl) + event.path());
        envelope.put("workspace", ws);
        envelope.put("actor", actor(event.actorId()));
        envelope.put("data", event.data());
        try {
            return objectMapper.writeValueAsString(envelope);
        } catch (Exception e) {
            throw new IllegalStateException("Webhook payload serialization failed", e);
        }
    }

    private Map<String, Object> actor(Long actorId) {
        if (actorId == null) return null;
        return userRepository.findById(actorId).map(u -> {
            Map<String, Object> actor = new LinkedHashMap<>();
            actor.put("id", u.getId());
            actor.put("name", u.getDisplayName());
            return actor;
        }).orElse(null);
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
