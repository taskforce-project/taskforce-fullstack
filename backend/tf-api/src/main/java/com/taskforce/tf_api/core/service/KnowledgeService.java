package com.taskforce.tf_api.core.service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeEdgeRequest;
import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.MoveNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.BrainOverviewResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeEdgeResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.enums.BrainTemplateType;
import com.taskforce.tf_api.core.enums.EdgeRelation;
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
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Brain OS — CRUD du graphe de connaissance (nodes + arêtes) et vue d'ensemble.
 *
 * <p>Délègue : l'amorçage à {@link BrainSeedingService}, l'indexation/recherche à
 * {@link BrainSearchService}, l'autorisation à {@link BrainAccessGuard}. Ne porte donc
 * qu'une responsabilité : la gestion structurelle du graphe.
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
    private static final int OVERVIEW_CAP = 1000;

    /**
     * Slugs d'espaces de démo qui s'amorcent avec le gabarit TASKFORCE (riche, dérivé des projets réels)
     * plutôt que BLANK, à la première ouverture de leur Brain OS. Réglable via `brain.demo-slugs`
     * (liste séparée par des virgules). Défaut : `demo`.
     */
    @Value("${brain.demo-slugs:demo}")
    private String demoSlugs;

    /** Gabarit d'amorçage paresseux : TASKFORCE pour un espace de démo listé, BLANK sinon. */
    private BrainTemplateType lazySeedTemplate(String slug) {
        if (slug != null && demoSlugs != null) {
            for (String s : demoSlugs.split(",")) {
                if (s.trim().equalsIgnoreCase(slug)) return BrainTemplateType.TASKFORCE;
            }
        }
        return BrainTemplateType.BLANK;
    }

    /**
     * Fusionne l'appartenance projet dans les metadata (clé {@code projects}).
     *
     * <p>C'est une <b>liste</b>, pas un {@code projectId} : une connaissance est souvent transverse
     * (une décision d'archi vaut pour le web ET l'API). C'est ce qui permet au graphe de dessiner
     * des régions qui se chevauchent plutôt que des parts de tarte exclusives. Une liste vide
     * détache la note de tout projet (elle redevient globale).
     */
    private static Map<String, Object> withProjects(Map<String, Object> metadata, List<Long> projects) {
        Map<String, Object> meta = metadata != null ? new HashMap<>(metadata) : new HashMap<>();
        if (projects != null) {
            List<Long> clean = projects.stream().filter(java.util.Objects::nonNull).distinct().toList();
            if (clean.isEmpty()) meta.remove("projects");
            else meta.put("projects", clean);
        }
        return meta;
    }

    // =========================================================================
    // Lecture
    // =========================================================================

    @Transactional
    public BrainOverviewResponse getOverview(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        // Rollout : les workspaces antérieurs à la feature n'ont pas de brain → amorçage à la première
        // ouverture pour que la vue ne soit jamais vide. Gabarit BLANK par défaut, mais TASKFORCE (riche,
        // dérivé des projets réels, hiérarchie Brain OS > Projets > notes) pour les espaces de démo listés
        // dans `brain.demo-slugs` : le brain de démo se remplit tout seul à sa 1re ouverture, sans passer
        // par le reseed owner-only (pratique quand l'espace est monté par SQL, hors flux applicatif).
        if (!seeding.exists(ws.getId())) {
            seeding.seedBrain(ws, lazySeedTemplate(ws.getSlug()), String.valueOf(userId));
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
        List<KnowledgeNode> nodes = allNodes.size() > OVERVIEW_CAP ? allNodes.subList(0, OVERVIEW_CAP) : allNodes;
        List<KnowledgeEdge> edges = allEdges.size() > OVERVIEW_CAP ? allEdges.subList(0, OVERVIEW_CAP) : allEdges;

        return BrainOverviewResponse.builder()
            .brainId(brain != null ? brain.getId() : null)
            .workspaceId(ws.getId())
            .templateType(brain != null ? brain.getTemplateType().name() : null)
            .versionLabel(brain != null ? brain.getVersionLabel() : "v1")
            .totalNodes(allNodes.size())
            .nodesByDomain(byDomain)
            .nodes(nodes.stream().map(BrainMapper::toNodeResponse).toList())
            .edges(edges.stream().map(BrainMapper::toEdgeResponse).toList())
            .build();
    }

    /** Réinitialise et réamorce le brain avec un gabarit (OWNER/ADMIN). Destructif. */
    @Transactional
    public void reseed(String slug, Long userId, String template) {
        Workspace ws = access.resolveAndAuthorizeOwner(slug, userId);
        BrainTemplateType type;
        try {
            type = template != null && !template.isBlank()
                ? BrainTemplateType.valueOf(template.trim().toUpperCase())
                : BrainTemplateType.BLANK;
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Gabarit inconnu: " + template);
        }
        seeding.reseed(ws, type, String.valueOf(userId));
    }

    @Transactional(readOnly = true)
    public List<KnowledgeNodeResponse> listNodes(String slug, Long userId, String domain) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        List<KnowledgeNode> nodes = (domain != null && !domain.isBlank())
            ? nodeRepository.findByWorkspaceIdAndDomainOrderByTitleAsc(ws.getId(), BrainEnums.domain(domain))
            : nodeRepository.findByWorkspaceIdOrderByDomainAscTitleAsc(ws.getId());
        return nodes.stream().map(BrainMapper::toNodeResponse).toList();
    }

    @Transactional(readOnly = true)
    public KnowledgeNodeResponse getNode(String slug, Long nodeId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        return BrainMapper.toNodeResponse(access.requireNode(nodeId, ws.getId()));
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
            .metadata(withProjects(req.getMetadata(), req.getProjects()))
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
        // Les projets peuvent être révisés seuls (sans toucher au reste des metadata) — on repart
        // alors de l'existant plutôt que de l'écraser.
        if (req.getMetadata() != null || req.getProjects() != null) {
            Map<String, Object> base = req.getMetadata() != null ? req.getMetadata() : node.getMetadata();
            node.setMetadata(withProjects(base, req.getProjects()));
        }
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

    // =========================================================================
    // Écriture — edges
    // =========================================================================

    @Transactional
    public KnowledgeEdgeResponse createEdge(String slug, Long userId, CreateKnowledgeEdgeRequest req) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        if (req.getFromNodeId().equals(req.getToNodeId())) {
            throw new IllegalArgumentException("Une arête ne peut pas relier un node à lui-même");
        }
        KnowledgeNode from = access.requireNode(req.getFromNodeId(), ws.getId());
        KnowledgeNode to   = access.requireNode(req.getToNodeId(), ws.getId());
        EdgeRelation relation = BrainEnums.relation(req.getRelationType());

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

        return BrainMapper.toEdgeResponse(edge);
    }

    @Transactional
    public void deleteEdge(String slug, Long edgeId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        KnowledgeEdge edge = edgeRepository.findById(edgeId)
            .filter(e -> e.getWorkspace().getId().equals(ws.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Relation introuvable"));
        edgeRepository.delete(edge);
    }
}
