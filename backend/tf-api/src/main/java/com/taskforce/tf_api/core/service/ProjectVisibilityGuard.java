package com.taskforce.tf_api.core.service;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
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
    private final ProjectRepository projectRepository;

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

    /**
     * Vrai si l'utilisateur peut <b>écrire</b> dans ce projet (créer/modifier/supprimer issues, statuts,
     * commentaires…). Règle « façon GitHub/Linear » : OWNER/ADMIN du workspace partout ; sinon un membre
     * du projet <b>non-VIEWER</b> (LEAD/MEMBER = contributeur) ; un non-membre ne contribue qu'à un projet
     * <b>public</b> (jamais à un privé, qu'il ne voit d'ailleurs pas). Le rôle {@code VIEWER} reste en
     * lecture seule, même sur un projet public.
     */
    public boolean canWrite(Project project, Long userId) {
        if (isWorkspaceAdmin(project.getWorkspace().getId(), userId)) {
            return true;
        }
        Optional<ProjectMember> membership =
            projectMemberRepository.findByProjectIdAndUserId(project.getId(), userId);
        if (membership.isPresent()) {
            return membership.get().getRole() != ProjectRole.VIEWER; // VIEWER = lecture seule
        }
        return project.isPublic(); // non-membre : contribue si public, jamais si privé
    }

    /**
     * Lève {@link ResourceNotFoundException} (→ 404) si l'utilisateur ne <b>voit</b> pas le projet (on ne
     * révèle pas un projet privé), puis {@link BusinessException} s'il le voit mais n'a pas le droit
     * d'<b>écrire</b> (rôle VIEWER). Garde d'écriture des opérations d'issue (TF-RBAC-WRITE).
     */
    public void assertCanWrite(Project project, Long userId) {
        assertCanView(project, userId); // 404 si invisible (projet privé) — avant même de parler de rôle
        if (!canWrite(project, userId)) {
            throw new BusinessException("Droits insuffisants pour modifier ce projet (rôle lecture seule).");
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

    /**
     * Ids des projets d'un workspace <b>visibles</b> par l'utilisateur (façon GitHub/Linear) : tous si
     * OWNER/ADMIN du workspace, sinon les projets <b>publics</b> + ceux dont il est <b>membre</b>. Sert
     * à scoper les vues agrégées (analytics, workflows) sans cacher la page (TF-RBAC-INTEL).
     */
    public List<Long> viewableProjectIds(Long workspaceId, Long userId) {
        List<Project> projects = projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId);
        if (isWorkspaceAdmin(workspaceId, userId)) {
            return projects.stream().map(Project::getId).toList();
        }
        Set<Long> member = memberProjectIds(userId);
        return projects.stream()
            .filter(p -> p.isPublic() || member.contains(p.getId()))
            .map(Project::getId)
            .toList();
    }
}
