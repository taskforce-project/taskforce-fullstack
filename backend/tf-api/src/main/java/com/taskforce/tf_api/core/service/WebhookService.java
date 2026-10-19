package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.dto.request.WebhookRequest;
import com.taskforce.tf_api.core.dto.response.CreatedWebhookResponse;
import com.taskforce.tf_api.core.dto.response.WebhookDeliveryResponse;
import com.taskforce.tf_api.core.dto.response.WebhookResponse;
import com.taskforce.tf_api.core.dto.response.WebhookSecretResponse;
import com.taskforce.tf_api.core.enums.WebhookEventType;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Webhook;
import com.taskforce.tf_api.core.model.WebhookDelivery;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.WebhookDeliveryRepository;
import com.taskforce.tf_api.core.repository.WebhookRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.webhook.WebhookDispatcher;
import com.taskforce.tf_api.core.service.webhook.WebhookOutbox;
import com.taskforce.tf_api.core.service.webhook.WebhookSignature;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Gestion des webhooks sortants d'un workspace (OSS-6.2, ADR-020) : création avec un secret de signature montré
 * une fois, modification (URL, événements, pause), nouveau secret, envoi de test et historique des envois.
 * L'envoi lui-même passe par {@link WebhookOutbox} et {@link WebhookDispatcher}.
 *
 * <p>Tout est réservé aux propriétaires et administrateurs, lecture comprise : un webhook envoie le contenu du
 * workspace à une adresse extérieure, et son URL vaut souvent un secret (n8n, Zapier).</p>
 */
@Service
@RequiredArgsConstructor
public class WebhookService {

    private static final int MAX_WEBHOOKS = 20;

    private final WebhookRepository         webhookRepository;
    private final WebhookDeliveryRepository deliveryRepository;
    private final WorkspaceRepository       workspaceRepository;
    private final AuthorizationService      authorizationService;
    private final WebhookOutbox             outbox;
    private final WebhookDispatcher         dispatcher;
    private final TransactionTemplate       tx;

    @Transactional
    public CreatedWebhookResponse create(String workspaceSlug, WebhookRequest req, User createdBy) {
        Workspace workspace = managedWorkspace(workspaceSlug, createdBy.getId());
        // Anti-SSRF : refuser une URL qui viserait le réseau interne (sauf instance qui l'autorise).
        dispatcher.assertAllowed(req.url());
        if (webhookRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId()).size() >= MAX_WEBHOOKS) {
            throw new BusinessException("A workspace can have up to " + MAX_WEBHOOKS + " webhooks");
        }
        String secret = WebhookSignature.newSecret();
        Webhook webhook = Webhook.builder()
            .workspace(workspace)
            .url(req.url())
            .secret(secret)
            .eventTypes(eventTypes(req.eventTypes()))
            .active(req.active() == null || req.active())
            .createdBy(createdBy)
            .build();
        webhookRepository.save(webhook);
        return new CreatedWebhookResponse(toResponse(webhook), secret);
    }

    @Transactional(readOnly = true)
    public List<WebhookResponse> list(String workspaceSlug, Long userId) {
        Workspace workspace = managedWorkspace(workspaceSlug, userId);
        return webhookRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())
            .stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public WebhookResponse update(String workspaceSlug, Long webhookId, WebhookRequest req, Long userId) {
        Webhook webhook = managedWebhook(workspaceSlug, webhookId, userId);
        // Anti-SSRF : même garde qu'à la création (une modification ne doit pas pouvoir viser l'interne).
        dispatcher.assertAllowed(req.url());
        webhook.setUrl(req.url());
        if (req.eventTypes() != null) webhook.setEventTypes(eventTypes(req.eventTypes()));
        if (req.active() != null) webhook.setActive(req.active());
        webhookRepository.save(webhook);
        return toResponse(webhook);
    }

    /** Nouveau secret de signature, montré une fois ; l'ancien ne signe plus aucun envoi. */
    @Transactional
    public WebhookSecretResponse regenerateSecret(String workspaceSlug, Long webhookId, Long userId) {
        Webhook webhook = managedWebhook(workspaceSlug, webhookId, userId);
        String secret = WebhookSignature.newSecret();
        webhook.setSecret(secret);
        webhookRepository.save(webhook);
        return new WebhookSecretResponse(secret);
    }

    @Transactional
    public void delete(String workspaceSlug, Long webhookId, Long userId) {
        Webhook webhook = managedWebhook(workspaceSlug, webhookId, userId);
        webhookRepository.delete(webhook);
    }

    /** Derniers envois du webhook, du plus récent au plus ancien. */
    @Transactional(readOnly = true)
    public List<WebhookDeliveryResponse> deliveries(String workspaceSlug, Long webhookId, Long userId) {
        Webhook webhook = managedWebhook(workspaceSlug, webhookId, userId);
        return deliveryRepository.findTop20ByWebhookIdOrderByCreatedAtDesc(webhook.getId())
            .stream()
            .map(WebhookService::toDeliveryResponse)
            .toList();
    }

    /**
     * Envoie tout de suite l'événement de test ({@code ping}) et renvoie son résultat. Sans transaction englobante :
     * la requête HTTP n'en tient aucune ; l'envoi est réservé à la création pour que le planificateur n'y touche pas.
     */
    public WebhookDeliveryResponse sendTest(String workspaceSlug, Long webhookId, Long userId) {
        Long deliveryId = tx.execute(status -> {
            Webhook webhook = managedWebhook(workspaceSlug, webhookId, userId);
            return outbox.enqueueTest(webhook, userId, LocalDateTime.now().plusMinutes(2)).getId();
        });
        dispatcher.deliver(deliveryId);
        return tx.execute(status -> toDeliveryResponse(deliveryRepository.findById(deliveryId).orElseThrow()));
    }

    // -------------------------------------------------------------------------

    private Workspace managedWorkspace(String workspaceSlug, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        authorizationService.requireManager(workspace.getId(), userId);
        return workspace;
    }

    private Webhook managedWebhook(String workspaceSlug, Long webhookId, Long userId) {
        Workspace workspace = managedWorkspace(workspaceSlug, userId);
        return webhookRepository.findById(webhookId)
            .filter(w -> w.getWorkspace().getId().equals(workspace.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Webhook not found: " + webhookId));
    }

    /** Événements connus seulement, sans doublon ; liste vide = tous. */
    private static String[] eventTypes(List<String> requested) {
        if (requested == null) return new String[]{};
        List<String> known = WebhookEventType.subscribable();
        Set<String> out = new LinkedHashSet<>();
        List<String> unknown = new ArrayList<>();
        for (String type : requested) {
            if (known.contains(type)) out.add(type);
            else unknown.add(type);
        }
        if (!unknown.isEmpty()) {
            throw new BusinessException("Unknown webhook event: " + String.join(", ", unknown)
                + ". Known events: " + String.join(", ", known));
        }
        return out.toArray(new String[0]);
    }

    private WebhookResponse toResponse(Webhook w) {
        return new WebhookResponse(
            w.getId(),
            w.getUrl(),
            w.getEventTypes() != null ? Arrays.asList(w.getEventTypes()) : List.of(),
            Boolean.TRUE.equals(w.getActive()),
            w.getLastFiredAt(),
            w.getLastStatus(),
            w.getCreatedAt()
        );
    }

    private static WebhookDeliveryResponse toDeliveryResponse(WebhookDelivery d) {
        return new WebhookDeliveryResponse(
            d.getDeliveryId().toString(),
            d.getEventType(),
            d.getStatus().name(),
            d.getAttempts(),
            d.getLastStatus(),
            d.getLastError(),
            d.getCreatedAt(),
            d.getDeliveredAt(),
            d.getNextAttemptAt()
        );
    }
}
