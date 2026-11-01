package com.taskforce.tf_api.core.service.brain;

import java.util.HashSet;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Garde d'accès au Brain OS : résolution du workspace par slug + vérification d'appartenance, puis ce que la personne
 * en lit ({@link BrainViewer}). Centralise l'autorisation pour tous les services brain.
 *
 * <p>Une note rattachée à un projet ne se lit que si l'on voit ce projet, comme partout dans l'app
 * ({@link ProjectVisibilityGuard}) : les notes d'un projet privé restent à ses membres et aux propriétaires et admins
 * de l'espace. La recherche (API, serveur MCP, Cortex et son outil), la vue d'ensemble et les pages passent par ici.</p>
 */
@Component
@RequiredArgsConstructor
public class BrainAccessGuard {

    private final WorkspaceRepository       workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final KnowledgeNodeRepository   nodeRepository;
    private final ProjectRepository         projectRepository;
    private final ProjectVisibilityGuard    projectVisibility;
    private final JdbcTemplate              jdbcTemplate;

    /** Résout le workspace et vérifie que l'utilisateur en est membre. */
    public Workspace resolveAndAuthorize(String slug, Long userId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(ws.getId(), userId)) {
            throw new ForbiddenException("Access denied: you're not a member of this workspace");
        }
        return ws;
    }

    /** Comme {@link #resolveAndAuthorize} mais exige le rôle OWNER/ADMIN (actions destructives). */
    public Workspace resolveAndAuthorizeOwner(String slug, Long userId) {
        Workspace ws = resolveAndAuthorize(slug, userId);
        WorkspaceRole role = workspaceMemberRepository.findByWorkspaceIdAndUserId(ws.getId(), userId)
            .map(m -> m.getRole())
            .orElseThrow(() -> new ForbiddenException("Access denied"));
        if (role != WorkspaceRole.OWNER && role != WorkspaceRole.ADMIN) {
            throw new ForbiddenException("Only the workspace owner or an admin can do this");
        }
        return ws;
    }

    /**
     * Ce que la personne lit du Brain OS de l'espace : tout pour un propriétaire ou un admin, sinon les notes de
     * l'espace et celles des projets qu'elle voit ({@link ProjectVisibilityGuard#viewableProjectIds}).
     */
    public BrainViewer viewer(Long workspaceId, Long userId) {
        if (projectVisibility.isWorkspaceAdmin(workspaceId, userId)) {
            return BrainViewer.seeingAll(workspaceId);
        }
        return BrainViewer.seeing(workspaceId, projectVisibility.viewableProjectIds(workspaceId, userId));
    }

    /**
     * Ce que lit tout le public d'un projet : les notes de l'espace, celles des projets publics et celles du projet.
     * Pour un texte que l'IA écrit sur un projet et que voient, sans relecture, tous ceux qui voient ce projet
     * (l'analyse d'un projet) : il ne tire rien d'un autre projet privé, même si la personne qui l'a lancé le voit.
     */
    public BrainViewer projectAudience(Long workspaceId, Long projectId) {
        return BrainViewer.seeing(workspaceId, projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
            .filter(p -> p.isPublic() || p.getId().equals(projectId))
            .map(Project::getId)
            .toList());
    }

    /**
     * Charge une note du workspace que la personne lit. Une note cachée répond comme une note absente (404) : on ne
     * révèle pas une page d'un projet privé, pas plus que le projet lui-même.
     */
    public KnowledgeNode requireNode(Long nodeId, BrainViewer viewer) {
        return nodeRepository.findByIdAndWorkspaceId(nodeId, viewer.workspaceId())
            .filter(node -> !hiddenNodeIds(viewer).contains(node.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Page not found: " + nodeId));
    }

    /** Identifiants des notes du workspace cachées à la personne ; aucun pour qui lit tout. */
    public Set<Long> hiddenNodeIds(BrainViewer viewer) {
        if (viewer.seesAll()) {
            return Set.of();
        }
        return new HashSet<>(jdbcTemplate.queryForList(BrainViewer.HIDDEN_NODES, Long.class, viewer.sqlArgs().toArray()));
    }
}
