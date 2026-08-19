package com.taskforce.tf_api.core.service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.ConnectPlaneRequest;
import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.PlaneStatusResponse;
import com.taskforce.tf_api.core.dto.response.PlaneSyncResponse;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.PlaneClient.PlaneProject;
import com.taskforce.tf_api.core.service.PlaneClient.PlaneWorkItem;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Connecteur <b>Plane → Brain OS</b> (jambe « observe » de la boucle OODA).
 *
 * <p>On stocke la clé API Plane (chiffrée, {@link Integration}), puis {@link #sync} tire les
 * work-items d'un projet Plane et les <b>ingère comme nodes de connaissance</b> (dédupliqués par
 * {@code metadata.externalId}, embeddés) — l'agent peut alors raisonner dessus (« déjà vu ? », OODA).
 * Lecture seule côté Plane : on n'écrit jamais rien chez eux.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PlaneIntegrationService {

    private final BrainAccessGuard        access;
    private final IntegrationRepository   integrationRepository;
    private final KnowledgeService        knowledgeService;
    private final KnowledgeNodeRepository nodeRepository;
    private final BrainSearchService      search;
    private final UserRepository          userRepository;
    private final PlaneClient             plane;
    private final JdbcTemplate            jdbcTemplate;

    private static final String SOURCE = "plane";

    // =========================================================================
    // Connexion / état
    // =========================================================================

    @Transactional
    public PlaneStatusResponse connect(String slug, Long userId, ConnectPlaneRequest req) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        // Validation : un appel réel lève BusinessException si la clé / le workspace sont invalides.
        plane.listProjects(req.apiKey(), req.planeWorkspace());

        Integration integ = integrationRepository
            .findByWorkspaceIdAndProvider(ws.getId(), IntegrationProvider.PLANE)
            .orElseGet(Integration::new);
        integ.setWorkspace(ws);
        integ.setProvider(IntegrationProvider.PLANE);
        integ.setAccessToken(req.apiKey());
        Map<String, String> meta = new HashMap<>();
        meta.put("planeWorkspace", req.planeWorkspace().trim());
        integ.setMeta(meta);
        integ.setInstalledBy(userRepository.findById(userId).orElse(null));
        integrationRepository.save(integ);

        return status(ws);
    }

    @Transactional(readOnly = true)
    public PlaneStatusResponse getStatus(String slug, Long userId) {
        return status(access.resolveAndAuthorize(slug, userId));
    }

    @Transactional(readOnly = true)
    public List<PlaneProject> listProjects(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Integration integ = require(ws);
        return plane.listProjects(integ.getAccessToken(), planeWorkspace(integ));
    }

    @Transactional
    public void disconnect(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        integrationRepository.deleteByWorkspaceIdAndProvider(ws.getId(), IntegrationProvider.PLANE);
    }

    // =========================================================================
    // Synchronisation → ingestion Brain OS
    // =========================================================================

    @Transactional
    public PlaneSyncResponse sync(String slug, Long userId, String projectId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Integration integ = require(ws);
        List<PlaneWorkItem> items = plane.listWorkItems(integ.getAccessToken(), planeWorkspace(integ), projectId);

        Map<String, Long> existing = existingPlaneNodes(ws.getId());
        int created = 0, updated = 0;
        for (PlaneWorkItem item : items) {
            if (item.id() == null) continue;
            String title = truncate("[Plane] " + safe(item.name(), "Sans titre"), 300);
            String content = buildContent(item);
            Map<String, Object> metadata = metadata(item, projectId);

            Long nodeId = existing.get(item.id());
            if (nodeId != null) {
                KnowledgeNode node = nodeRepository.findById(nodeId).orElse(null);
                if (node != null) {
                    node.setTitle(title);
                    node.setContent(content);
                    node.setMetadata(metadata);
                    node.setUpdatedBy(String.valueOf(userId));
                    nodeRepository.save(node);
                    search.embedNode(node); // ré-indexe (contenu susceptible d'avoir changé)
                    updated++;
                }
            } else {
                CreateKnowledgeNodeRequest req = CreateKnowledgeNodeRequest.builder()
                    .type("NOTE")
                    .domain("PROJET")
                    .title(title)
                    .content(content)
                    .tags(List.of("plane", "external"))
                    .metadata(metadata)
                    .build();
                knowledgeService.createNode(slug, userId, req); // embed + link-sync inclus
                created++;
            }
        }
        log.info("Sync Plane workspace {} projet {} : {} créés, {} MAJ ({} work-items)",
            ws.getId(), projectId, created, updated, items.size());
        return new PlaneSyncResponse(created, updated, items.size());
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private PlaneStatusResponse status(Workspace ws) {
        Integration integ = integrationRepository
            .findByWorkspaceIdAndProvider(ws.getId(), IntegrationProvider.PLANE).orElse(null);
        Long count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM knowledge_nodes WHERE workspace_id = ? AND metadata->>'source' = ?",
            Long.class, ws.getId(), SOURCE);
        return new PlaneStatusResponse(
            integ != null,
            integ != null ? planeWorkspace(integ) : null,
            count != null ? count : 0L);
    }

    private Map<String, Long> existingPlaneNodes(Long workspaceId) {
        Map<String, Long> map = new HashMap<>();
        jdbcTemplate.query(
            "SELECT id, metadata->>'externalId' AS ext FROM knowledge_nodes "
            + "WHERE workspace_id = ? AND metadata->>'source' = ?",
            rs -> { map.put(rs.getString("ext"), rs.getLong("id")); },
            workspaceId, SOURCE);
        return map;
    }

    private Integration require(Workspace ws) {
        return integrationRepository.findByWorkspaceIdAndProvider(ws.getId(), IntegrationProvider.PLANE)
            .orElseThrow(() -> new BusinessException("Plane n'est pas connecté pour ce workspace"));
    }

    private String planeWorkspace(Integration integ) {
        return integ.getMeta() != null ? integ.getMeta().get("planeWorkspace") : null;
    }

    private String buildContent(PlaneWorkItem item) {
        StringBuilder sb = new StringBuilder();
        sb.append(item.description() != null && !item.description().isBlank()
            ? item.description().trim() : "_(sans description)_");
        sb.append("\n\n> État : ").append(safe(item.state(), "—"))
          .append(" · Priorité : ").append(safe(item.priority(), "—"));
        if (item.sequenceId() != null) sb.append(" · Plane #").append(item.sequenceId());
        return sb.toString();
    }

    private Map<String, Object> metadata(PlaneWorkItem item, String projectId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", SOURCE);
        m.put("externalId", item.id());
        m.put("planeProjectId", projectId);
        if (item.state() != null) m.put("state", item.state());
        if (item.priority() != null) m.put("priority", item.priority());
        if (item.sequenceId() != null) m.put("sequenceId", item.sequenceId());
        return m;
    }

    private String safe(String v, String fallback) {
        return v != null && !v.isBlank() ? v : fallback;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) : s;
    }
}
