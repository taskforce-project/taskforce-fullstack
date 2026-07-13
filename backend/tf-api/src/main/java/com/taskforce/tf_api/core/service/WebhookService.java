package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.WebhookRequest;
import com.taskforce.tf_api.core.dto.response.WebhookResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Webhook;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.WebhookRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class WebhookService {

    private final WebhookRepository   webhookRepository;
    private final WorkspaceRepository workspaceRepository;
    private final RestTemplate        restTemplate;
    private final ObjectMapper        objectMapper;
    private final AuthorizationService authorizationService; // gate OWNER/ADMIN du CRUD (webhook sortant = exfil)

    // ----------------------------------------------------------------
    // CRUD
    // ----------------------------------------------------------------

    @Transactional
    public WebhookResponse create(String workspaceSlug, WebhookRequest req, User createdBy) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        // Webhook sortant = risque d'exfiltration → réservé aux gestionnaires (OWNER/ADMIN).
        authorizationService.requireManager(workspace.getId(), createdBy.getId());

        Webhook webhook = Webhook.builder()
            .workspace(workspace)
            .url(req.url())
            .secret(req.secret())
            .eventTypes(req.eventTypes() != null ? req.eventTypes().toArray(new String[0]) : new String[]{})
            .active(true)
            .createdBy(createdBy)
            .build();

        webhookRepository.save(webhook);
        return toResponse(webhook);
    }

    public List<WebhookResponse> list(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return webhookRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())
            .stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public WebhookResponse update(String workspaceSlug, Long webhookId, WebhookRequest req, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        authorizationService.requireManager(workspace.getId(), userId);

        Webhook webhook = webhookRepository.findById(webhookId)
            .filter(w -> w.getWorkspace().getId().equals(workspace.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Webhook not found: " + webhookId));

        webhook.setUrl(req.url());
        if (req.secret() != null) webhook.setSecret(req.secret());
        if (req.eventTypes() != null) webhook.setEventTypes(req.eventTypes().toArray(new String[0]));

        webhookRepository.save(webhook);
        return toResponse(webhook);
    }

    @Transactional
    public void delete(String workspaceSlug, Long webhookId, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        authorizationService.requireManager(workspace.getId(), userId);
        webhookRepository.deleteByIdAndWorkspaceId(webhookId, workspace.getId());
    }

    // ----------------------------------------------------------------
    // Fire webhooks asynchronously on events
    // ----------------------------------------------------------------

    @Async
    public void fire(Long workspaceId, String eventType, Object payload) {
        List<Webhook> webhooks = webhookRepository.findByWorkspaceIdAndActiveTrue(workspaceId);
        for (Webhook webhook : webhooks) {
            if (!matchesEvent(webhook.getEventTypes(), eventType)) continue;
            fireOne(webhook, eventType, payload);
        }
    }

    private void fireOne(Webhook webhook, String eventType, Object payload) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body = Map.of(
                "event",   eventType,
                "payload", payload
            );

            String json = objectMapper.writeValueAsString(body);
            HttpEntity<String> request = new HttpEntity<>(json, headers);

            var response = restTemplate.postForEntity(webhook.getUrl(), request, String.class);
            webhook.setLastFiredAt(LocalDateTime.now());
            webhook.setLastStatus(response.getStatusCode().value());
        } catch (Exception e) {
            log.warn("Failed to fire webhook {} to {}: {}", webhook.getId(), webhook.getUrl(), e.getMessage());
            webhook.setLastFiredAt(LocalDateTime.now());
            webhook.setLastStatus(0);
        } finally {
            webhookRepository.save(webhook);
        }
    }

    private boolean matchesEvent(String[] eventTypes, String eventType) {
        if (eventTypes == null || eventTypes.length == 0) return true; // wildcard
        return Arrays.asList(eventTypes).contains(eventType);
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
}
