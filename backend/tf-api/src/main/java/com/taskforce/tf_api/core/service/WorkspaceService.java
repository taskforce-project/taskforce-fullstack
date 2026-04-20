package com.taskforce.tf_api.core.service;

import java.text.Normalizer;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.InviteMemberRequest;
import com.taskforce.tf_api.core.dto.request.UpdateMemberRoleRequest;
import com.taskforce.tf_api.core.dto.request.UpdateWorkspaceRequest;
import com.taskforce.tf_api.core.dto.response.WorkspaceMemberResponse;
import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service de gestion des workspaces.
 * Chaque utilisateur possède son propre workspace (créé automatiquement à l'inscription).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final UserRepository userRepository;

    // -------------------------------------------------------------------------
    // Création automatique à l'inscription
    // -------------------------------------------------------------------------

    /**
     * Crée un workspace pour un nouvel utilisateur et l'ajoute comme OWNER.
     * Appelé depuis AuthService.verifyOtpAndCompleteRegistration().
     *
     * @param owner         l'utilisateur propriétaire (déjà sauvegardé en DB)
     * @param ownerFirstName prénom récupéré depuis Keycloak (peut être null)
     */
    @Transactional
    public Workspace createWorkspace(User owner, String ownerFirstName) {
        String baseName = buildWorkspaceName(owner, ownerFirstName);
        String slug = generateUniqueSlug(baseName);

        Workspace workspace = Workspace.builder()
            .name(baseName + "'s Workspace")
            .slug(slug)
            .owner(owner)
            .build();

        workspace = workspaceRepository.save(workspace);
        log.info("Workspace '{}' créé pour l'utilisateur {}", workspace.getSlug(), owner.getId());

        // Ajouter le propriétaire comme membre OWNER
        WorkspaceMember ownerMember = WorkspaceMember.builder()
            .workspace(workspace)
            .user(owner)
            .role(WorkspaceRole.OWNER)
            .build();

        workspaceMemberRepository.save(ownerMember);

        return workspace;
    }

    // -------------------------------------------------------------------------
    // Lecture
    // -------------------------------------------------------------------------

    /**
     * Retourne le workspace de l'utilisateur (workspace dont il est le propriétaire).
     */
    @Transactional(readOnly = true)
    public WorkspaceResponse getWorkspaceByUserId(Long userId) {
        Workspace workspace = workspaceRepository.findByOwnerId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));

        return toResponse(workspace);
    }

    /**
     * Retourne la liste des membres d'un workspace.
     * L'utilisateur doit être membre du workspace.
     */
    @Transactional(readOnly = true)
    public List<WorkspaceMemberResponse> getMembers(Long workspaceId, Long requestingUserId) {
        Workspace workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));

        assertIsMember(workspace, requestingUserId);

        return workspaceMemberRepository.findByWorkspaceId(workspaceId).stream()
            .map(this::toMemberResponse)
            .collect(Collectors.toList());
    }

    // -------------------------------------------------------------------------
    // Mise à jour du workspace
    // -------------------------------------------------------------------------

    /**
     * Met à jour les informations d'un workspace.
     * Seuls OWNER et ADMIN peuvent modifier.
     */
    @Transactional
    public WorkspaceResponse updateWorkspace(Long workspaceId, Long requestingUserId,
                                             UpdateWorkspaceRequest request) {
        Workspace workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));

        assertCanManage(workspace, requestingUserId);

        if (request.getName() != null && !request.getName().isBlank()) {
            workspace.setName(request.getName());
        }
        if (request.getDescription() != null) {
            workspace.setDescription(request.getDescription());
        }
        if (request.getLogoUrl() != null) {
            workspace.setLogoUrl(request.getLogoUrl());
        }

        return toResponse(workspaceRepository.save(workspace));
    }

    // -------------------------------------------------------------------------
    // Gestion des membres
    // -------------------------------------------------------------------------

    /**
     * Invite un utilisateur existant (par email) dans le workspace.
     * L'utilisateur invité doit déjà avoir un compte sur la plateforme.
     * Seuls OWNER et ADMIN peuvent inviter.
     */
    @Transactional
    public WorkspaceMemberResponse inviteMember(Long workspaceId, Long requestingUserId,
                                                InviteMemberRequest request) {
        Workspace workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));

        assertCanManage(workspace, requestingUserId);

        User invitee = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new ResourceNotFoundException(
                "Aucun compte trouvé pour l'email : " + request.getEmail()));

        if (workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, invitee.getId())) {
            throw new IllegalStateException("Cet utilisateur est déjà membre du workspace");
        }

        User inviter = userRepository.findById(requestingUserId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        WorkspaceMember member = WorkspaceMember.builder()
            .workspace(workspace)
            .user(invitee)
            .role(WorkspaceRole.MEMBER)
            .invitedBy(inviter)
            .build();

        return toMemberResponse(workspaceMemberRepository.save(member));
    }

    /**
     * Change le rôle d'un membre.
     * Seul l'OWNER peut promouvoir en ADMIN ou rétrograder. Le rôle OWNER ne peut pas être changé.
     */
    @Transactional
    public WorkspaceMemberResponse updateMemberRole(Long workspaceId, Long requestingUserId,
                                                    Long memberId, UpdateMemberRoleRequest request) {
        Workspace workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));

        // Seul le OWNER peut changer les rôles
        assertIsOwner(workspace, requestingUserId);

        WorkspaceMember member = workspaceMemberRepository.findById(memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Membre introuvable"));

        if (!member.getWorkspace().getId().equals(workspaceId)) {
            throw new IllegalArgumentException("Ce membre n'appartient pas à ce workspace");
        }

        if (member.getRole() == WorkspaceRole.OWNER) {
            throw new IllegalStateException("Impossible de changer le rôle du propriétaire");
        }

        if (request.getRole() == WorkspaceRole.OWNER) {
            throw new IllegalStateException("Impossible d'attribuer le rôle OWNER via cette opération");
        }

        member.setRole(request.getRole());
        return toMemberResponse(workspaceMemberRepository.save(member));
    }

    /**
     * Retire un membre du workspace.
     * OWNER et ADMIN peuvent retirer un MEMBER. Seul l'OWNER peut retirer un ADMIN.
     * Le OWNER ne peut pas être retiré.
     */
    @Transactional
    public void removeMember(Long workspaceId, Long requestingUserId, Long memberId) {
        Workspace workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));

        WorkspaceMember target = workspaceMemberRepository.findById(memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Membre introuvable"));

        if (!target.getWorkspace().getId().equals(workspaceId)) {
            throw new IllegalArgumentException("Ce membre n'appartient pas à ce workspace");
        }

        if (target.getRole() == WorkspaceRole.OWNER) {
            throw new IllegalStateException("Impossible de retirer le propriétaire du workspace");
        }

        // Vérifier que le demandeur peut gérer ce membre
        WorkspaceMember requester = workspaceMemberRepository
            .findByWorkspaceIdAndUserId(workspaceId, requestingUserId)
            .orElseThrow(() -> new IllegalStateException("Vous n'êtes pas membre de ce workspace"));

        if (requester.getRole() == WorkspaceRole.MEMBER) {
            throw new IllegalStateException("Vous n'avez pas les droits pour retirer un membre");
        }

        // Un ADMIN ne peut pas retirer un autre ADMIN
        if (requester.getRole() == WorkspaceRole.ADMIN && target.getRole() == WorkspaceRole.ADMIN) {
            throw new IllegalStateException("Un administrateur ne peut pas retirer un autre administrateur");
        }

        workspaceMemberRepository.delete(target);
        log.info("Membre {} retiré du workspace {}", target.getUser().getId(), workspaceId);
    }

    // -------------------------------------------------------------------------
    // Helpers privés
    // -------------------------------------------------------------------------

    private String buildWorkspaceName(User owner, String ownerFirstName) {
        if (ownerFirstName != null && !ownerFirstName.isBlank()) {
            return ownerFirstName;
        }
        // Fallback : partie locale de l'email
        String email = owner.getEmail();
        return email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
    }

    private String generateUniqueSlug(String base) {
        String normalized = Normalizer.normalize(base, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase()
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-|-$", "");

        String candidate = normalized;
        int attempt = 0;

        while (workspaceRepository.existsBySlug(candidate)) {
            attempt++;
            if (attempt == 1) {
                candidate = normalized + "-" + UUID.randomUUID().toString().substring(0, 6);
            } else {
                candidate = normalized + "-" + UUID.randomUUID().toString().substring(0, 6);
            }
        }

        return candidate;
    }

    private void assertIsMember(Workspace workspace, Long userId) {
        boolean isMember = workspaceMemberRepository
            .existsByWorkspaceIdAndUserId(workspace.getId(), userId);
        if (!isMember) {
            throw new IllegalStateException("Vous n'avez pas accès à ce workspace");
        }
    }

    private void assertCanManage(Workspace workspace, Long userId) {
        WorkspaceMember member = workspaceMemberRepository
            .findByWorkspaceIdAndUserId(workspace.getId(), userId)
            .orElseThrow(() -> new IllegalStateException("Vous n'avez pas accès à ce workspace"));

        if (member.getRole() == WorkspaceRole.MEMBER) {
            throw new IllegalStateException("Vous n'avez pas les droits pour cette action");
        }
    }

    private void assertIsOwner(Workspace workspace, Long userId) {
        WorkspaceMember member = workspaceMemberRepository
            .findByWorkspaceIdAndUserId(workspace.getId(), userId)
            .orElseThrow(() -> new IllegalStateException("Vous n'avez pas accès à ce workspace"));

        if (member.getRole() != WorkspaceRole.OWNER) {
            throw new IllegalStateException("Seul le propriétaire peut effectuer cette action");
        }
    }

    private WorkspaceResponse toResponse(Workspace workspace) {
        int memberCount = workspaceMemberRepository.findByWorkspaceId(workspace.getId()).size();
        User owner = workspace.getOwner();

        String ownerName = owner.getDisplayName() != null
            ? owner.getDisplayName()
            : owner.getEmail();

        return WorkspaceResponse.builder()
            .id(workspace.getId())
            .name(workspace.getName())
            .slug(workspace.getSlug())
            .description(workspace.getDescription())
            .logoUrl(workspace.getLogoUrl())
            .ownerId(owner.getId())
            .ownerName(ownerName)
            .memberCount(memberCount)
            .createdAt(workspace.getCreatedAt())
            .updatedAt(workspace.getUpdatedAt())
            .build();
    }

    private WorkspaceMemberResponse toMemberResponse(WorkspaceMember member) {
        User user = member.getUser();
        return WorkspaceMemberResponse.builder()
            .id(member.getId())
            .userId(user.getId())
            .email(user.getEmail())
            .displayName(user.getDisplayName())
            .avatarUrl(user.getAvatarUrl())
            .role(member.getRole())
            .joinedAt(member.getJoinedAt())
            .build();
    }
}
