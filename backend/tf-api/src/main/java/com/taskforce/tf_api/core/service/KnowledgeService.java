package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeEdgeRequest;
import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.BrainOverviewResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeEdgeResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.enums.BrainTemplateType;
import com.taskforce.tf_api.core.enums.EdgeRelation;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.model.BrainWorkspace;
import com.taskforce.tf_api.core.model.KnowledgeEdge;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.BrainWorkspaceRepository;
import com.taskforce.tf_api.core.repository.KnowledgeEdgeRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Brain OS — gestion du graphe de connaissance d'un workspace.
 *
 * <p>Auth : tout membre du workspace accède au brain (v1 : pas de confidentiel, tout le monde
 * voit tout). Le filtrage fin par rôle viendra avec la marketplace (Phase 5).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class KnowledgeService {

    private final WorkspaceRepository       workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final BrainWorkspaceRepository  brainWorkspaceRepository;
    private final KnowledgeNodeRepository   nodeRepository;
    private final KnowledgeEdgeRepository   edgeRepository;
    private final BrainTemplateService      templateService;

    // =========================================================================
    // Amorçage (appelé à la création d'un workspace)
    // =========================================================================

    /**
     * Crée le brain d'un workspace et le peuple selon le gabarit. Idempotent : ne fait rien
     * si un brain existe déjà. Participe à la transaction de l'appelant (création de workspace
     * atomique : workspace + owner + brain, ou rien).
     */
    @Transactional
    public void seedBrain(Workspace workspace, BrainTemplateType template, String actor) {
        if (brainWorkspaceRepository.existsByWorkspaceId(workspace.getId())) {
            return;
        }
        BrainWorkspace brain = brainWorkspaceRepository.save(BrainWorkspace.builder()
            .workspace(workspace)
            .templateType(template != null ? template : BrainTemplateType.BLANK)
            .versionLabel("v1")
            .build());

        List<KnowledgeNode> nodes = new ArrayList<>();
        for (BrainTemplateService.SeedNode seed : templateService.nodesFor(brain.getTemplateType())) {
            nodes.add(KnowledgeNode.builder()
                .workspace(workspace)
                .brain(brain)
                .type(seed.type())
                .domain(seed.domain())
                .title(seed.title())
                .content(seed.content())
                .status(NodeStatus.ACTIVE)
                .versionLabel("v1")
                .metadata(new HashMap<>(Map.of("seeded", true)))
                .build());
        }
        nodeRepository.saveAll(nodes);
        log.info("Brain OS amorcé pour workspace '{}' (gabarit={}, {} nodes)",
            workspace.getSlug(), brain.getTemplateType(), nodes.size());
    }

    // =========================================================================
    // Lecture
    // =========================================================================

    @Transactional
    public BrainOverviewResponse getOverview(String slug, Long userId) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        // Rollout : les workspaces créés avant la feature n'ont pas de brain → on en amorce
        // un vierge (BLANK) à la première ouverture, pour que la vue ne soit jamais vide.
        if (!brainWorkspaceRepository.existsByWorkspaceId(ws.getId())) {
            seedBrain(ws, BrainTemplateType.BLANK, String.valueOf(userId));
        }
        BrainWorkspace brain = brainWorkspaceRepository.findByWorkspaceId(ws.getId()).orElse(null);

        List<KnowledgeNode> nodes =
            nodeRepository.findByWorkspaceIdAndStatusOrderByDomainAscTitleAsc(ws.getId(), NodeStatus.ACTIVE);
        List<KnowledgeEdge> edges = edgeRepository.findByWorkspaceId(ws.getId());

        Map<String, Long> byDomain = new LinkedHashMap<>();
        for (KnowledgeNode node : nodes) {
            byDomain.merge(node.getDomain().name(), 1L, Long::sum);
        }

        return BrainOverviewResponse.builder()
            .brainId(brain != null ? brain.getId() : null)
            .workspaceId(ws.getId())
            .templateType(brain != null ? brain.getTemplateType().name() : null)
            .versionLabel(brain != null ? brain.getVersionLabel() : "v1")
            .totalNodes(nodes.size())
            .nodesByDomain(byDomain)
            .nodes(nodes.stream().map(this::toNodeResponse).toList())
            .edges(edges.stream().map(this::toEdgeResponse).toList())
            .build();
    }

    @Transactional(readOnly = true)
    public List<KnowledgeNodeResponse> listNodes(String slug, Long userId, String domain) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        List<KnowledgeNode> nodes = (domain != null && !domain.isBlank())
            ? nodeRepository.findByWorkspaceIdAndDomainOrderByTitleAsc(ws.getId(), parseDomain(domain))
            : nodeRepository.findByWorkspaceIdOrderByDomainAscTitleAsc(ws.getId());
        return nodes.stream().map(this::toNodeResponse).toList();
    }

    @Transactional(readOnly = true)
    public KnowledgeNodeResponse getNode(String slug, Long nodeId, Long userId) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        return toNodeResponse(requireNode(nodeId, ws.getId()));
    }

    // =========================================================================
    // Écriture — nodes
    // =========================================================================

    @Transactional
    public KnowledgeNodeResponse createNode(String slug, Long userId, CreateKnowledgeNodeRequest req) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        BrainWorkspace brain = brainWorkspaceRepository.findByWorkspaceId(ws.getId()).orElse(null);

        KnowledgeNode node = KnowledgeNode.builder()
            .workspace(ws)
            .brain(brain)
            .type(parseType(req.getType()))
            .domain(parseDomain(req.getDomain()))
            .title(req.getTitle())
            .content(req.getContent())
            .status(NodeStatus.ACTIVE)
            .versionLabel("v1")
            .refType(req.getRefType() != null ? parseRefType(req.getRefType()) : null)
            .refId(req.getRefId())
            .metadata(req.getMetadata() != null ? req.getMetadata() : new HashMap<>())
            .build();
        // Attribution explicite (pas d'AuditorAware dans le projet ; convention = id user en string).
        node.setCreatedBy(String.valueOf(userId));
        node.setUpdatedBy(String.valueOf(userId));

        return toNodeResponse(nodeRepository.save(node));
    }

    @Transactional
    public KnowledgeNodeResponse updateNode(String slug, Long nodeId, Long userId, UpdateKnowledgeNodeRequest req) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        KnowledgeNode node = requireNode(nodeId, ws.getId());

        if (req.getTitle() != null)        node.setTitle(req.getTitle());
        if (req.getContent() != null)      node.setContent(req.getContent());
        if (req.getType() != null)         node.setType(parseType(req.getType()));
        if (req.getDomain() != null)       node.setDomain(parseDomain(req.getDomain()));
        if (req.getStatus() != null)       node.setStatus(parseStatus(req.getStatus()));
        if (req.getVersionLabel() != null) node.setVersionLabel(req.getVersionLabel());
        if (req.getMetadata() != null)     node.setMetadata(req.getMetadata());
        node.setUpdatedBy(String.valueOf(userId));

        return toNodeResponse(nodeRepository.save(node));
    }

    @Transactional
    public void deleteNode(String slug, Long nodeId, Long userId) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        KnowledgeNode node = requireNode(nodeId, ws.getId());
        nodeRepository.delete(node); // les arêtes sont supprimées en cascade (FK ON DELETE CASCADE)
    }

    // =========================================================================
    // Écriture — edges
    // =========================================================================

    @Transactional
    public KnowledgeEdgeResponse createEdge(String slug, Long userId, CreateKnowledgeEdgeRequest req) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        if (req.getFromNodeId().equals(req.getToNodeId())) {
            throw new IllegalArgumentException("Une arête ne peut pas relier un node à lui-même");
        }
        KnowledgeNode from = requireNode(req.getFromNodeId(), ws.getId());
        KnowledgeNode to   = requireNode(req.getToNodeId(), ws.getId());
        EdgeRelation relation = parseRelation(req.getRelationType());

        if (edgeRepository.existsByFromNodeIdAndToNodeIdAndRelationType(from.getId(), to.getId(), relation)) {
            throw new IllegalStateException("Cette relation existe déjà");
        }

        KnowledgeEdge edge = edgeRepository.save(KnowledgeEdge.builder()
            .workspace(ws)
            .fromNode(from)
            .toNode(to)
            .relationType(relation)
            .weight(req.getWeight() != null ? req.getWeight() : 1.0)
            .createdBy(String.valueOf(userId))
            .build());

        return toEdgeResponse(edge);
    }

    @Transactional
    public void deleteEdge(String slug, Long edgeId, Long userId) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        KnowledgeEdge edge = edgeRepository.findById(edgeId)
            .filter(e -> e.getWorkspace().getId().equals(ws.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Relation introuvable"));
        edgeRepository.delete(edge);
    }

    // =========================================================================
    // Helpers — auth & résolution
    // =========================================================================

    private Workspace resolveAndAuthorize(String slug, Long userId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(ws.getId(), userId)) {
            throw new ForbiddenException("Accès refusé : vous n'êtes pas membre de cet espace de travail");
        }
        return ws;
    }

    private KnowledgeNode requireNode(Long nodeId, Long workspaceId) {
        return nodeRepository.findByIdAndWorkspaceId(nodeId, workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Node introuvable: " + nodeId));
    }

    // =========================================================================
    // Helpers — parsing d'enums (erreur explicite si valeur invalide)
    // =========================================================================

    private NodeType parseType(String v) {
        try { return NodeType.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Type de node invalide: " + v); }
    }

    private NodeDomain parseDomain(String v) {
        try { return NodeDomain.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Domaine invalide: " + v); }
    }

    private NodeStatus parseStatus(String v) {
        try { return NodeStatus.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Statut invalide: " + v); }
    }

    private NodeRefType parseRefType(String v) {
        try { return NodeRefType.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("refType invalide: " + v); }
    }

    private EdgeRelation parseRelation(String v) {
        try { return EdgeRelation.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Type de relation invalide: " + v); }
    }

    // =========================================================================
    // Helpers — mapping
    // =========================================================================

    private KnowledgeNodeResponse toNodeResponse(KnowledgeNode n) {
        return KnowledgeNodeResponse.builder()
            .id(n.getId())
            .uuid(n.getUuid() != null ? n.getUuid().toString() : null)
            .type(n.getType().name())
            .domain(n.getDomain().name())
            .domainCode(n.getDomain().getCode())
            .title(n.getTitle())
            .content(n.getContent())
            .contentUrl(n.getContentUrl())
            .status(n.getStatus().name())
            .versionLabel(n.getVersionLabel())
            .refType(n.getRefType() != null ? n.getRefType().name() : null)
            .refId(n.getRefId())
            .metadata(n.getMetadata())
            .createdAt(n.getCreatedAt())
            .updatedAt(n.getUpdatedAt())
            .createdBy(n.getCreatedBy())
            .build();
    }

    private KnowledgeEdgeResponse toEdgeResponse(KnowledgeEdge e) {
        return KnowledgeEdgeResponse.builder()
            .id(e.getId())
            .fromNodeId(e.getFromNode().getId())
            .toNodeId(e.getToNode().getId())
            .relationType(e.getRelationType().name())
            .weight(e.getWeight())
            .build();
    }
}
