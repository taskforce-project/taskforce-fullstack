package com.taskforce.tf_api.core.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

import lombok.RequiredArgsConstructor;

/**
 * Autorisation des abonnements <b>temps réel</b> (STOMP), côté {@code core} (donc autorisée à lire la
 * base) — appelée par {@code StompAuthInterceptor} qui reste mince (TF-RT-AUTH-CHANNELS). Ferme la fuite
 * cross-tenant <b>H2</b> : {@code /topic/projects.{projectId}} et {@code /topic/analysis.{workspaceId}}
 * n'exigeaient qu'une session authentifiée — n'importe quel utilisateur pouvait streamer l'activité
 * d'issues et les analyses IA d'un autre compte en énumérant des ids séquentiels.
 */
@Service
@RequiredArgsConstructor
public class RealtimeAuthorizationService {

    private final ProjectRepository projectRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final ProjectVisibilityGuard visibilityGuard;

    /** Vrai si l'utilisateur peut s'abonner au flux d'un projet (public, membre, ou OWNER/ADMIN du workspace). */
    @Transactional(readOnly = true)
    public boolean canSubscribeProject(Long userId, Long projectId) {
        return projectRepository.findById(projectId)
            .map(project -> visibilityGuard.canView(project, userId))
            .orElse(false);
    }

    /** Vrai si l'utilisateur est membre du workspace (flux d'analyse IA). */
    @Transactional(readOnly = true)
    public boolean canSubscribeWorkspace(Long userId, Long workspaceId) {
        return workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId);
    }
}
