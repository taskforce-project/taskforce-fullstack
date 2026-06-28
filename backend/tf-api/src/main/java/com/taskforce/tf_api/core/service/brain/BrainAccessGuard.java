package com.taskforce.tf_api.core.service.brain;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Garde d'accès au Brain OS : résolution du workspace par slug + vérification d'appartenance,
 * et résolution scopée d'un node. Centralise l'autorisation pour tous les services brain.
 *
 * <p>v1 : tout membre du workspace accède au brain (pas de confidentiel). Le filtrage fin par
 * rôle se brancherait ici (point d'extension unique).
 */
@Component
@RequiredArgsConstructor
public class BrainAccessGuard {

    private final WorkspaceRepository       workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final KnowledgeNodeRepository   nodeRepository;

    /** Résout le workspace et vérifie que l'utilisateur en est membre. */
    public Workspace resolveAndAuthorize(String slug, Long userId) {
        Workspace ws = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(ws.getId(), userId)) {
            throw new ForbiddenException("Accès refusé : vous n'êtes pas membre de cet espace de travail");
        }
        return ws;
    }

    /** Charge un node en s'assurant qu'il appartient bien au workspace donné. */
    public KnowledgeNode requireNode(Long nodeId, Long workspaceId) {
        return nodeRepository.findByIdAndWorkspaceId(nodeId, workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Node introuvable: " + nodeId));
    }
}
