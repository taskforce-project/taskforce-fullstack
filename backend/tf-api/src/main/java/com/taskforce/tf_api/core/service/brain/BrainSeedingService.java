package com.taskforce.tf_api.core.service.brain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.BrainTemplateType;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.model.BrainWorkspace;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.BrainWorkspaceRepository;
import com.taskforce.tf_api.core.repository.KnowledgeEdgeRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.BrainTemplateService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Amorçage du Brain OS d'un workspace selon un gabarit. Responsabilité unique : créer le
 * {@link BrainWorkspace} et ses nodes initiaux. Appelé à la création d'un workspace et en
 * rollback-safe (participe à la transaction de l'appelant).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BrainSeedingService {

    private final BrainWorkspaceRepository brainWorkspaceRepository;
    private final KnowledgeNodeRepository  nodeRepository;
    private final KnowledgeEdgeRepository  edgeRepository;
    private final BrainTemplateService     templateService;
    private final BrainLinkService         links;

    /**
     * Réinitialise complètement le brain d'un workspace puis le réamorce avec un gabarit.
     * <b>Destructif</b> : purge nodes + arêtes + brain existants.
     */
    @Transactional
    public void reseed(Workspace workspace, BrainTemplateType template, String actor) {
        edgeRepository.deleteByWorkspaceId(workspace.getId());
        nodeRepository.deleteByWorkspaceId(workspace.getId());
        brainWorkspaceRepository.findByWorkspaceId(workspace.getId())
            .ifPresent(brainWorkspaceRepository::delete);
        seedBrain(workspace, template, actor);
    }

    /** True si le workspace possède déjà un brain. */
    public boolean exists(Long workspaceId) {
        return brainWorkspaceRepository.existsByWorkspaceId(workspaceId);
    }

    /**
     * Crée le brain et le peuple selon le gabarit. Idempotent (no-op si déjà présent).
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
            Map<String, Object> meta = new HashMap<>();
            meta.put("seeded", true);
            if (seed.system()) meta.put("system", true); // node du noyau (caché côté utilisateur)
            nodes.add(KnowledgeNode.builder()
                .workspace(workspace)
                .brain(brain)
                .type(seed.type())
                .domain(seed.domain())
                .title(seed.title())
                .content(seed.content())
                .status(NodeStatus.ACTIVE)
                .versionLabel("v1")
                .metadata(meta)
                .build());
        }
        nodeRepository.saveAll(nodes);

        // Tisse l'architecture : les [[wikilinks]] du hub/READMEs → arêtes auto (graphe connecté).
        for (KnowledgeNode node : nodes) {
            links.syncFromContent(node, null);
        }

        log.info("Brain OS amorcé pour workspace '{}' (gabarit={}, {} nodes)",
            workspace.getSlug(), brain.getTemplateType(), nodes.size());
    }
}
