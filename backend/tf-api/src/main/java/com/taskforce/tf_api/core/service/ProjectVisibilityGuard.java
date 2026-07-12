package com.taskforce.tf_api.core.service;

import java.util.HashSet;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Garde de visibilité des projets (« façon GitHub ») — <b>source unique de vérité</b> partagée par
 * {@link ProjectService} et {@link IssueService}.
 *
 * <p>Un projet est visible par un utilisateur s'il est <b>public</b>, OU si l'utilisateur en est
 * <b>membre</b> ({@code ProjectMember}), OU s'il est <b>OWNER/ADMIN</b> du workspace. Sinon → 404
 * (on ne révèle pas l'existence d'un projet privé).</p>
 */
@Component
@RequiredArgsConstructor
public class ProjectVisibilityGuard {

    private final ProjectMemberRepository projectMemberRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;

    /** Vrai si l'utilisateur peut voir ce projet. */
    public boolean canView(Project project, Long userId) {
        if (project.isPublic()) {
            return true;
        }
        if (projectMemberRepository.existsByProjectIdAndUserId(project.getId(), userId)) {
            return true;
        }
        return isWorkspaceAdmin(project.getWorkspace().getId(), userId);
    }

    /** Lève {@link ResourceNotFoundException} (→ 404) si l'utilisateur ne peut pas voir le projet. */
    public void assertCanView(Project project, Long userId) {
        if (!canView(project, userId)) {
            throw new ResourceNotFoundException("Projet introuvable");
        }
    }

    /** Vrai si l'utilisateur est OWNER ou ADMIN du workspace (voit tous les projets, même privés). */
    public boolean isWorkspaceAdmin(Long workspaceId, Long userId) {
        return workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, userId)
            .map(wm -> wm.getRole().name().equals("OWNER") || wm.getRole().name().equals("ADMIN"))
            .orElse(false);
    }

    /** Ids des projets dont l'utilisateur est membre — pour filtrer efficacement une liste cross-projets. */
    public Set<Long> memberProjectIds(Long userId) {
        return new HashSet<>(projectMemberRepository.findProjectIdsByUserId(userId));
    }
}
