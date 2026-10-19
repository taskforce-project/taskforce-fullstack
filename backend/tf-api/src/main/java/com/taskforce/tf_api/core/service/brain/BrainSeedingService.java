package com.taskforce.tf_api.core.service.brain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.model.BrainWorkspace;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.BrainWorkspaceRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;

import org.springframework.data.domain.PageRequest;
import com.taskforce.tf_api.core.service.BrainTemplateService;
import com.taskforce.tf_api.core.service.BrainTemplateService.ProjectRef;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Amorçage du Brain OS d'un workspace. Responsabilité unique : créer le
 * {@link BrainWorkspace} et ses nodes initiaux. Appelé à la création d'un workspace et en
 * rollback-safe (participe à la transaction de l'appelant).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BrainSeedingService {

    private final BrainWorkspaceRepository brainWorkspaceRepository;
    private final KnowledgeNodeRepository  nodeRepository;
    private final BrainTemplateService     templateService;
    private final BrainLinkService         links;
    private final ProjectRepository        projectRepository;
    private final IssueRepository          issueRepository;

    /** True si le workspace possède déjà un brain. */
    public boolean exists(Long workspaceId) {
        return brainWorkspaceRepository.existsByWorkspaceId(workspaceId);
    }

    /**
     * Crée le brain et le peuple. Idempotent (no-op si déjà présent).
     */
    @Transactional
    public void seedBrain(Workspace workspace, String actor) {
        if (brainWorkspaceRepository.existsByWorkspaceId(workspace.getId())) {
            return;
        }
        BrainWorkspace brain = brainWorkspaceRepository.save(BrainWorkspace.builder()
            .workspace(workspace)
            .versionLabel("v1")
            .build());

        // Projets déjà présents dans le workspace : un dossier chacun.
        List<ProjectRef> projects = projectRepository
            .findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId()).stream()
            .map(p -> new ProjectRef(p.getId(), p.getName(),
                issueRepository.findByProjectIdOrderBySequenceNumberDesc(p.getId(), PageRequest.of(0, 50))
                    .getContent().stream().map(i -> i.getTitle()).toList()))
            .toList();

        List<BrainTemplateService.SeedNode> seeds =
            templateService.nodesFor(projects, workspace.getName());
        List<KnowledgeNode> nodes = new ArrayList<>(seeds.size());
        Map<String, Integer> keyToIdx = new HashMap<>();
        for (int i = 0; i < seeds.size(); i++) {
            BrainTemplateService.SeedNode seed = seeds.get(i);
            Map<String, Object> meta = new HashMap<>();
            meta.put("seeded", true);
            if (seed.system()) meta.put("system", true); // node du noyau (caché côté utilisateur)
            // Le dossier d'espace (clé "ws") porte refType=WORKSPACE (refId = id de l'espace) : c'est
            // l'ancre que l'ingestion live (writeProjectNode/writeWorkspaceNode) retrouve pour rattacher
            // les projets dessous et enrichir le contexte. Les projets portent refType=PROJECT.
            NodeRefType refType = seed.projectRefId() != null ? NodeRefType.PROJECT : null;
            Long refId = seed.projectRefId();
            if ("ws".equals(seed.key())) { refType = NodeRefType.WORKSPACE; refId = workspace.getId(); }
            nodes.add(KnowledgeNode.builder()
                .workspace(workspace)
                .brain(brain)
                .type(seed.type())
                .domain(seed.domain())
                .title(seed.title())
                .content(seed.content())
                .refType(refType)
                .refId(refId)
                .status(NodeStatus.ACTIVE)
                .versionLabel("v1")
                .metadata(meta)
                .build());
            if (seed.key() != null) keyToIdx.put(seed.key(), i);
        }
        nodeRepository.saveAll(nodes);

        // 2ᵉ passe : résoudre les parents (hiérarchie récursive projet → système → … → note).
        List<KnowledgeNode> reparented = new ArrayList<>();
        for (int i = 0; i < seeds.size(); i++) {
            String pk = seeds.get(i).parentKey();
            if (pk == null) continue;
            Integer pidx = keyToIdx.get(pk);
            if (pidx != null) { nodes.get(i).setParentNodeId(nodes.get(pidx).getId()); reparented.add(nodes.get(i)); }
        }
        if (!reparented.isEmpty()) nodeRepository.saveAll(reparented);

        // Tisse l'architecture : les [[wikilinks]] du hub/READMEs → arêtes auto (graphe connecté).
        for (KnowledgeNode node : nodes) {
            links.syncFromContent(node, null);
        }

        log.info("Brain OS amorcé pour workspace '{}' ({} nodes)", workspace.getSlug(), nodes.size());
    }
}
