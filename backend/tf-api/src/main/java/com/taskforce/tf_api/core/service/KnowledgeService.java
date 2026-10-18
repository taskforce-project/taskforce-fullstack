package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.MoveNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.BrainOverviewResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.model.BrainWorkspace;
import com.taskforce.tf_api.core.model.KnowledgeEdge;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.BrainWorkspaceRepository;
import com.taskforce.tf_api.core.repository.KnowledgeEdgeRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainEnums;
import com.taskforce.tf_api.core.service.brain.BrainLinkService;
import com.taskforce.tf_api.core.service.brain.BrainMapper;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.brain.BrainSeedingService;

import lombok.RequiredArgsConstructor;

/**
 * Brain OS — CRUD des pages de connaissance et vue d'ensemble (arêtes tirées des #tags et [[wikilinks]]).
 *
 * <p>Délègue : l'amorçage à {@link BrainSeedingService}, l'indexation/recherche à
 * {@link BrainSearchService}, l'autorisation à {@link BrainAccessGuard}. Ne porte donc
 * qu'une responsabilité : la gestion structurelle des pages.
 */
@Service
@RequiredArgsConstructor
public class KnowledgeService {

    private final BrainWorkspaceRepository brainWorkspaceRepository;
    private final KnowledgeNodeRepository  nodeRepository;
    private final KnowledgeEdgeRepository  edgeRepository;
    private final BrainAccessGuard         access;
    private final BrainSeedingService      seeding;
    private final BrainSearchService       search;
    private final BrainLinkService         links;

    /** Plafond de nodes/arêtes renvoyés dans la vue d'ensemble (protège le payload + le rendu). */
    private static final int OVERVIEW_CAP = 2000;

    /** Copie modifiable des metadata (jamais null : la colonne attend un objet). */
    private static Map<String, Object> copyOf(Map<String, Object> metadata) {
        return metadata != null ? new HashMap<>(metadata) : new HashMap<>();
    }

    // =========================================================================
    // Lecture
    // =========================================================================

    @Transactional
    public BrainOverviewResponse getOverview(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        // Rollout : les workspaces antérieurs à la feature (ou montés par SQL) n'ont pas de brain →
        // amorçage à la première ouverture pour que la vue ne soit jamais vide.
        if (!seeding.exists(ws.getId())) {
            seeding.seedBrain(ws, String.valueOf(userId));
        }
        BrainWorkspace brain = brainWorkspaceRepository.findByWorkspaceId(ws.getId()).orElse(null);

        List<KnowledgeNode> allNodes =
            nodeRepository.findByWorkspaceIdAndStatusOrderByDomainAscTitleAsc(ws.getId(), NodeStatus.ACTIVE);
        List<KnowledgeEdge> allEdges = edgeRepository.findByWorkspaceId(ws.getId());

        Map<String, Long> byDomain = new LinkedHashMap<>();
        for (KnowledgeNode node : allNodes) {
            byDomain.merge(node.getDomain().name(), 1L, Long::sum);
        }

        // Borne le payload : au-delà du plafond, on tronque (totalNodes reflète le vrai total).
        List<KnowledgeNode> nodes = capStructureAware(allNodes, OVERVIEW_CAP);
        List<KnowledgeEdge> edges = allEdges.size() > OVERVIEW_CAP ? allEdges.subList(0, OVERVIEW_CAP) : allEdges;

        return BrainOverviewResponse.builder()
            .brainId(brain != null ? brain.getId() : null)
            .workspaceId(ws.getId())
            .versionLabel(brain != null ? brain.getVersionLabel() : "v1")
            .totalNodes(allNodes.size())
            .nodesByDomain(byDomain)
            .nodes(nodes.stream().map(BrainMapper::toNodeResponse).toList())
            .edges(edges.stream().map(BrainMapper::toEdgeResponse).toList())
            .build();
    }

    /**
     * Tronque en préservant le SQUELETTE de containment. Sous le plafond, renvoie tout ; au-delà, garde
     * d'abord tous les nœuds « conteneurs » (référencés comme {@code parentNodeId} par un autre : hub,
     * espace, projets, systèmes…) puis complète avec les feuilles jusqu'au plafond. Sans ça, un tri par
     * domaine peut éjecter le hub/les projets (domaine PROJET tardif) au-delà du plafond → l'arbre perd
     * son ossature (tout devient orphelin). L'ordre d'entrée (domaine, titre) est conservé.
     */
    static List<KnowledgeNode> capStructureAware(List<KnowledgeNode> ordered, int cap) {
        if (ordered.size() <= cap) return ordered;
        Set<Long> containerIds = new HashSet<>();
        for (KnowledgeNode n : ordered) {
            if (n.getParentNodeId() != null) containerIds.add(n.getParentNodeId());
        }
        List<KnowledgeNode> kept = new ArrayList<>(cap);
        for (KnowledgeNode n : ordered) {                     // 1re passe : l'ossature, toujours retenue
            if (containerIds.contains(n.getId())) kept.add(n);
        }
        for (KnowledgeNode n : ordered) {                     // 2e passe : les feuilles, jusqu'au plafond
            if (kept.size() >= cap) break;
            if (!containerIds.contains(n.getId())) kept.add(n);
        }
        return kept;
    }

    // =========================================================================
    // Écriture — nodes
    // =========================================================================

    @Transactional
    public KnowledgeNodeResponse createNode(String slug, Long userId, CreateKnowledgeNodeRequest req) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        BrainWorkspace brain = brainWorkspaceRepository.findByWorkspaceId(ws.getId()).orElse(null);

        // Page parente (arbre facon Notion) : validee dans le MEME workspace (requireNode leve sinon).
        Long parentId = req.getParentNodeId() != null
            ? access.requireNode(req.getParentNodeId(), ws.getId()).getId()
            : null;

        KnowledgeNode node = KnowledgeNode.builder()
            .workspace(ws)
            .brain(brain)
            .type(BrainEnums.type(req.getType()))
            .domain(BrainEnums.domain(req.getDomain()))
            .title(req.getTitle())
            .content(req.getContent())
            .status(NodeStatus.ACTIVE)
            .versionLabel("v1")
            .refType(req.getRefType() != null ? BrainEnums.refType(req.getRefType()) : null)
            .refId(req.getRefId())
            .parentNodeId(parentId)
            .metadata(copyOf(req.getMetadata()))
            .build();
        // Attribution explicite (pas d'AuditorAware ; convention projet = id user en string).
        node.setCreatedBy(String.valueOf(userId));
        node.setUpdatedBy(String.valueOf(userId));

        KnowledgeNode saved = nodeRepository.save(node);
        links.syncFromContent(saved, req.getTags()); // #tags + [[wikilinks]] → arêtes auto
        search.embedNode(saved); // index sémantique (best-effort)
        return BrainMapper.toNodeResponse(saved);
    }

    @Transactional
    public KnowledgeNodeResponse updateNode(String slug, Long nodeId, Long userId, UpdateKnowledgeNodeRequest req) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        KnowledgeNode node = access.requireNode(nodeId, ws.getId());

        if (req.getTitle() != null)        node.setTitle(req.getTitle());
        if (req.getContent() != null)      node.setContent(req.getContent());
        if (req.getType() != null)         node.setType(BrainEnums.type(req.getType()));
        if (req.getDomain() != null)       node.setDomain(BrainEnums.domain(req.getDomain()));
        if (req.getStatus() != null)       node.setStatus(BrainEnums.status(req.getStatus()));
        if (req.getVersionLabel() != null) node.setVersionLabel(req.getVersionLabel());
        // Reparentage (deplacer une page sous une autre) : garde meme-workspace + anti-cycle.
        if (req.getParentNodeId() != null) {
            node.setParentNodeId(resolveParentForMove(nodeId, req.getParentNodeId(), ws.getId()));
        }
        if (req.getMetadata() != null) node.setMetadata(copyOf(req.getMetadata()));
        node.setUpdatedBy(String.valueOf(userId));

        KnowledgeNode saved = nodeRepository.save(node);
        links.syncFromContent(saved, req.getTags()); // re-sync #tags + [[wikilinks]]
        search.embedNode(saved); // recalcul de l'embedding après édition
        return BrainMapper.toNodeResponse(saved);
    }

    /**
     * Valide un nouveau parent pour le deplacement d'une page : meme workspace ({@code requireNode}
     * leve sinon), pas soi-meme, et <b>aucun cycle</b> (le nouveau parent ne doit pas etre un
     * descendant de la page deplacee). Retourne l'id du parent valide.
     */
    private Long resolveParentForMove(Long nodeId, Long newParentId, Long workspaceId) {
        if (newParentId.equals(nodeId)) {
            throw new IllegalArgumentException("Une page ne peut pas etre sa propre parente");
        }
        KnowledgeNode parent = access.requireNode(newParentId, workspaceId);
        // Remonte la chaine des ancetres du nouveau parent : si on retombe sur la page, c'est un cycle.
        Long cursor = parent.getParentNodeId();
        int guard = 0;
        while (cursor != null && guard++ < 10_000) {
            if (cursor.equals(nodeId)) {
                throw new IllegalArgumentException("Deplacement invalide : cela creerait un cycle dans l'arbre");
            }
            KnowledgeNode ancestor = nodeRepository.findByIdAndWorkspaceId(cursor, workspaceId).orElse(null);
            cursor = ancestor != null ? ancestor.getParentNodeId() : null;
        }
        return parent.getId();
    }

    /**
     * Deplace une page dans l'arbre (drag-to-nest). {@code parentNodeId} null = racine du domaine
     * (explicite, contrairement a updateNode). Reutilise la garde anti-cycle. Deplacement purement
     * STRUCTUREL : contenu/tags inchanges -> ni re-embed ni re-sync des liens.
     */
    @Transactional
    public KnowledgeNodeResponse moveNode(String slug, Long nodeId, Long userId, MoveNodeRequest req) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        KnowledgeNode node = access.requireNode(nodeId, ws.getId());
        node.setParentNodeId(req.getParentNodeId() != null
            ? resolveParentForMove(nodeId, req.getParentNodeId(), ws.getId())
            : null);
        if (req.getDomain() != null) {
            node.setDomain(BrainEnums.domain(req.getDomain()));
        }
        node.setUpdatedBy(String.valueOf(userId));
        return BrainMapper.toNodeResponse(nodeRepository.save(node));
    }

    @Transactional
    public void deleteNode(String slug, Long nodeId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        KnowledgeNode node = access.requireNode(nodeId, ws.getId());
        nodeRepository.delete(node); // arêtes supprimées en cascade (FK ON DELETE CASCADE)
    }
}
