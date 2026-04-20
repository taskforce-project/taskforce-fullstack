package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest;
import com.taskforce.tf_api.core.dto.request.CreateLabelRequest;
import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.request.UpdateProjectRequest;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.ProjectStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectLabel;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectLabelRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service de gestion des projets.
 * Toutes les opérations sont scopées par workspace.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectService {

    private final ProjectRepository        projectRepository;
    private final ProjectMemberRepository  projectMemberRepository;
    private final ProjectLabelRepository   projectLabelRepository;
    private final WorkspaceRepository      workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final UserRepository           userRepository;

    // -------------------------------------------------------------------------
    // Lecture
    // -------------------------------------------------------------------------

    /**
     * Liste tous les projets d'un workspace.
     * L'utilisateur doit être membre du workspace.
     */
    @Transactional(readOnly = true)
    public List<ProjectResponse> listProjects(String workspaceSlug, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        return projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())
            .stream()
            .map(this::toResponse)
            .collect(Collectors.toList());
    }

    /**
     * Retourne un projet par son id.
     * L'utilisateur doit être membre du workspace.
     */
    @Transactional(readOnly = true)
    public ProjectResponse getProject(String workspaceSlug, Long projectId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        return toResponse(project);
    }

    // -------------------------------------------------------------------------
    // Création / Mise à jour / Suppression
    // -------------------------------------------------------------------------

    /**
     * Crée un nouveau projet dans le workspace.
     * L'auteur devient automatiquement membre LEAD.
     */
    @Transactional
    public ProjectResponse createProject(String workspaceSlug, Long requestingUserId,
                                         CreateProjectRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        User creator = resolveUser(requestingUserId);

        String identifier = request.getIdentifier().toUpperCase();
        if (projectRepository.existsByWorkspaceIdAndIdentifier(workspace.getId(), identifier)) {
            throw new BusinessException(
                "L'identifiant '" + identifier + "' est déjà utilisé dans ce workspace");
        }

        Project project = Project.builder()
            .workspace(workspace)
            .name(request.getName())
            .identifier(identifier)
            .description(request.getDescription())
            .status(ProjectStatus.ACTIVE)
            .isPublic(request.isPublic())
            .createdBy(creator)
            .build();

        project = projectRepository.save(project);
        log.info("Projet '{}' ({}) créé dans le workspace '{}'",
            project.getName(), project.getIdentifier(), workspaceSlug);

        // Le créateur devient LEAD automatiquement
        ProjectMember lead = ProjectMember.builder()
            .project(project)
            .user(creator)
            .role(ProjectRole.LEAD)
            .addedBy(creator)
            .build();
        projectMemberRepository.save(lead);

        return toResponse(project);
    }

    /**
     * Met à jour les informations d'un projet (patch partiel).
     * Seuls les membres LEAD du projet ou OWNER/ADMIN du workspace peuvent modifier.
     */
    @Transactional
    public ProjectResponse updateProject(String workspaceSlug, Long projectId,
                                         Long requestingUserId, UpdateProjectRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());

        assertCanManageProject(project, workspace, requestingUserId);

        if (request.getName() != null && !request.getName().isBlank()) {
            project.setName(request.getName());
        }
        if (request.getDescription() != null) {
            project.setDescription(request.getDescription());
        }
        if (request.getStatus() != null) {
            project.setStatus(request.getStatus());
        }
        if (request.getIsPublic() != null) {
            project.setPublic(request.getIsPublic());
        }

        return toResponse(projectRepository.save(project));
    }

    /**
     * Archive un projet (soft-delete — statut ARCHIVED).
     * Seuls LEAD ou OWNER/ADMIN du workspace.
     */
    @Transactional
    public ProjectResponse archiveProject(String workspaceSlug, Long projectId,
                                           Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        project.setStatus(ProjectStatus.ARCHIVED);
        log.info("Projet {} archivé par l'utilisateur {}", projectId, requestingUserId);
        return toResponse(projectRepository.save(project));
    }

    /**
     * Suppression définitive d'un projet.
     * Réservé au OWNER du workspace ou au LEAD du projet.
     */
    @Transactional
    public void deleteProject(String workspaceSlug, Long projectId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        projectRepository.delete(project);
        log.info("Projet {} supprimé par l'utilisateur {}", projectId, requestingUserId);
    }

    // -------------------------------------------------------------------------
    // Gestion des membres
    // -------------------------------------------------------------------------

    /**
     * Liste les membres d'un projet.
     */
    @Transactional(readOnly = true)
    public List<ProjectMemberResponse> listMembers(String workspaceSlug, Long projectId,
                                                    Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        resolveProject(projectId, workspace.getId());

        return projectMemberRepository.findByProjectId(projectId)
            .stream()
            .map(this::toMemberResponse)
            .collect(Collectors.toList());
    }

    /**
     * Ajoute un utilisateur au projet.
     * L'utilisateur doit déjà être membre du workspace.
     */
    @Transactional
    public ProjectMemberResponse addMember(String workspaceSlug, Long projectId,
                                            Long requestingUserId, AddProjectMemberRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        User invitee = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new ResourceNotFoundException(
                "Aucun compte trouvé pour l'email : " + request.getEmail()));

        // L'invité doit déjà être membre du workspace
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), invitee.getId())) {
            throw new BusinessException(
                "L'utilisateur doit d'abord être membre du workspace pour rejoindre ce projet");
        }

        if (projectMemberRepository.existsByProjectIdAndUserId(projectId, invitee.getId())) {
            throw new BusinessException("Cet utilisateur est déjà membre du projet");
        }

        User requester = resolveUser(requestingUserId);
        ProjectMember member = ProjectMember.builder()
            .project(project)
            .user(invitee)
            .role(request.getRole())
            .addedBy(requester)
            .build();

        return toMemberResponse(projectMemberRepository.save(member));
    }

    /**
     * Retire un membre du projet.
     * Un membre peut se retirer lui-même. Le LEAD ou OWNER/ADMIN peut retirer n'importe qui.
     */
    @Transactional
    public void removeMember(String workspaceSlug, Long projectId,
                              Long requestingUserId, Long memberId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());

        ProjectMember target = projectMemberRepository.findById(memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Membre introuvable"));

        if (!target.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("Ce membre n'appartient pas à ce projet");
        }

        boolean isSelf = target.getUser().getId().equals(requestingUserId);
        if (!isSelf) {
            assertCanManageProject(project, workspace, requestingUserId);
        }

        projectMemberRepository.delete(target);
        log.info("Membre {} retiré du projet {} par l'utilisateur {}", memberId, projectId, requestingUserId);
    }

    // -------------------------------------------------------------------------
    // Gestion des labels
    // -------------------------------------------------------------------------

    /**
     * Liste les labels d'un projet.
     */
    @Transactional(readOnly = true)
    public List<ProjectLabelResponse> listLabels(String workspaceSlug, Long projectId,
                                                  Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        resolveProject(projectId, workspace.getId());

        return projectLabelRepository.findByProjectIdOrderByNameAsc(projectId)
            .stream()
            .map(this::toLabelResponse)
            .collect(Collectors.toList());
    }

    /**
     * Crée un nouveau label sur un projet.
     */
    @Transactional
    public ProjectLabelResponse createLabel(String workspaceSlug, Long projectId,
                                             Long requestingUserId, CreateLabelRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        if (projectLabelRepository.existsByProjectIdAndName(projectId, request.getName())) {
            throw new BusinessException("Un label avec ce nom existe déjà dans ce projet");
        }

        ProjectLabel label = ProjectLabel.builder()
            .project(project)
            .name(request.getName())
            .color(request.getColor() != null ? request.getColor() : "#6366f1")
            .description(request.getDescription())
            .build();

        return toLabelResponse(projectLabelRepository.save(label));
    }

    /**
     * Supprime un label d'un projet.
     */
    @Transactional
    public void deleteLabel(String workspaceSlug, Long projectId, Long labelId,
                             Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        ProjectLabel label = projectLabelRepository.findById(labelId)
            .orElseThrow(() -> new ResourceNotFoundException("Label introuvable"));

        if (!label.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("Ce label n'appartient pas à ce projet");
        }

        projectLabelRepository.delete(label);
    }

    // -------------------------------------------------------------------------
    // Helpers internes
    // -------------------------------------------------------------------------

    private Workspace resolveWorkspaceAndAssertMember(String slug, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable : " + slug));

        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), userId)) {
            throw new BusinessException("Vous n'êtes pas membre de ce workspace");
        }

        return workspace;
    }

    private Project resolveProject(Long projectId, Long workspaceId) {
        return projectRepository.findByIdAndWorkspaceId(projectId, workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
    }

    private User resolveUser(Long userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    /**
     * Vérifie que l'utilisateur peut gérer le projet :
     * - Rôle LEAD dans le projet, OU
     * - Rôle OWNER ou ADMIN dans le workspace
     */
    private void assertCanManageProject(Project project, Workspace workspace, Long userId) {
        boolean isProjectLead = projectMemberRepository
            .findByProjectIdAndUserId(project.getId(), userId)
            .map(pm -> pm.getRole() == ProjectRole.LEAD)
            .orElse(false);

        if (isProjectLead) return;

        workspaceMemberRepository.findByWorkspaceIdAndUserId(workspace.getId(), userId)
            .filter(wm -> wm.getRole().name().equals("OWNER") || wm.getRole().name().equals("ADMIN"))
            .orElseThrow(() -> new BusinessException(
                "Droits insuffisants pour gérer ce projet"));
    }

    // -------------------------------------------------------------------------
    // Mappers
    // -------------------------------------------------------------------------

    private ProjectResponse toResponse(Project project) {
        List<ProjectMember> members = projectMemberRepository.findByProjectId(project.getId());
        List<ProjectLabel>  labels  = projectLabelRepository.findByProjectIdOrderByNameAsc(project.getId());

        User owner = project.getWorkspace().getOwner();
        String ownerName = (owner.getDisplayName() != null && !owner.getDisplayName().isBlank())
            ? owner.getDisplayName()
            : owner.getEmail();

        User creator = project.getCreatedBy();
        String creatorName = (creator.getDisplayName() != null && !creator.getDisplayName().isBlank())
            ? creator.getDisplayName()
            : creator.getEmail();

        return ProjectResponse.builder()
            .id(project.getId())
            .name(project.getName())
            .identifier(project.getIdentifier())
            .description(project.getDescription())
            .status(project.getStatus())
            .isPublic(project.isPublic())
            .workspaceId(project.getWorkspace().getId())
            .workspaceSlug(project.getWorkspace().getSlug())
            .createdById(creator.getId())
            .createdByName(creatorName)
            .memberCount(members.size())
            .totalIssues(0)   // Étape 3 — issues
            .openIssues(0)    // Étape 3 — issues
            .members(members.stream().map(this::toMemberResponse).collect(Collectors.toList()))
            .labels(labels.stream().map(this::toLabelResponse).collect(Collectors.toList()))
            .createdAt(project.getCreatedAt())
            .updatedAt(project.getUpdatedAt())
            .build();
    }

    private ProjectMemberResponse toMemberResponse(ProjectMember pm) {
        User user = pm.getUser();
        String displayName = (user.getDisplayName() != null && !user.getDisplayName().isBlank())
            ? user.getDisplayName()
            : user.getEmail();

        return ProjectMemberResponse.builder()
            .id(pm.getId())
            .userId(user.getId())
            .email(user.getEmail())
            .displayName(displayName)
            .avatarUrl(user.getAvatarUrl())
            .role(pm.getRole())
            .joinedAt(pm.getJoinedAt())
            .build();
    }

    private ProjectLabelResponse toLabelResponse(ProjectLabel label) {
        return ProjectLabelResponse.builder()
            .id(label.getId())
            .name(label.getName())
            .color(label.getColor())
            .description(label.getDescription())
            .createdAt(label.getCreatedAt())
            .build();
    }
}
