package com.taskforce.tf_api.core.service;

import java.text.Normalizer;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateWorkspaceRequest;
import com.taskforce.tf_api.core.dto.request.InviteMemberRequest;
import com.taskforce.tf_api.core.dto.request.UpdateMemberRoleRequest;
import com.taskforce.tf_api.core.dto.request.UpdateWorkspaceRequest;
import com.taskforce.tf_api.core.dto.response.WorkspaceMemberResponse;
import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.dto.response.WorkspaceUsageResponse;
import com.taskforce.tf_api.core.enums.BrainTemplateType;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.dto.response.AuditLogResponse;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSeedingService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
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
    private final AuditService auditService;
    private final BrainSeedingService brainSeedingService;

    // Limites de workspaces par plan (les membres sont illimités : tarification par membre/mois)
    private static final long MAX_WORKSPACES_FREE = 2;
    private static final long MAX_WORKSPACES_BASIC = 5;

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

        // Brain OS vierge (16 domaines) amorcé automatiquement à l'inscription.
        brainSeedingService.seedBrain(workspace, BrainTemplateType.BLANK, owner.getEmail());

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
     * Retourne un workspace par son slug.
     * L'utilisateur doit être membre.
     */
    @Transactional(readOnly = true)
    public WorkspaceResponse getWorkspaceBySlug(String slug, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertIsMember(workspace, userId);
        return toResponse(workspace);
    }

    /**
     * Retourne tous les workspaces dont l'utilisateur est membre.
     */
    @Transactional(readOnly = true)
    public List<WorkspaceResponse> listWorkspacesByUser(Long userId) {
        return workspaceRepository.findAllByMemberId(userId).stream()
            .map(this::toResponse)
            .collect(Collectors.toList());
    }

    /**
     * Crée un nouveau workspace (déclenché depuis le controller).
     * Vérifie la limite de workspaces selon le plan.
     */
    @Transactional
    public WorkspaceResponse createNewWorkspace(Long userId, CreateWorkspaceRequest request) {
        User owner = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        long count = workspaceRepository.countByMemberId(userId);
        checkWorkspaceLimit(owner.getPlanType(), count);

        String slug = generateUniqueSlug(request.getName());
        Workspace workspace = Workspace.builder()
            .name(request.getName())
            .slug(slug)
            .description(request.getDescription())
            .owner(owner)
            .build();

        workspace = workspaceRepository.save(workspace);
        log.info("Workspace '{}' créé par l'utilisateur {}", workspace.getSlug(), userId);

        WorkspaceMember ownerMember = WorkspaceMember.builder()
            .workspace(workspace)
            .user(owner)
            .role(WorkspaceRole.OWNER)
            .build();
        workspaceMemberRepository.save(ownerMember);

        // Amorçage du Brain OS selon le gabarit choisi (BLANK par défaut).
        brainSeedingService.seedBrain(workspace, parseBrainTemplate(request.getBrainTemplate()), owner.getEmail());

        return toResponse(workspace);
    }

    /** Parse le gabarit de brain demandé ; tolère null/invalide → BLANK. */
    private BrainTemplateType parseBrainTemplate(String raw) {
        if (raw == null || raw.isBlank()) {
            return BrainTemplateType.BLANK;
        }
        try {
            return BrainTemplateType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            log.warn("Gabarit de brain inconnu '{}', repli sur BLANK", raw);
            return BrainTemplateType.BLANK;
        }
    }

    /** Membres illimités sur tous les plans (tarification par membre/mois, pas de plafond). */
    private long memberLimitFor(PlanType plan) {
        return Long.MAX_VALUE;
    }

    /** Limite de workspaces par plan (Long.MAX_VALUE = illimité). Switch exhaustif = MAJ forcée si un tier est ajouté. */
    private long workspaceLimitFor(PlanType plan) {
        return switch (plan) {
            case FREE -> MAX_WORKSPACES_FREE;
            case BASIC -> MAX_WORKSPACES_BASIC;
            case BUSINESS, ENTERPRISE -> Long.MAX_VALUE;
        };
    }

    private void checkMemberLimit(PlanType plan, long current) {
        long limit = memberLimitFor(plan);
        if (current >= limit) {
            throw new IllegalStateException(
                "Limite de membres atteinte pour ce plan (" + limit + " max). "
                + "Passez à un plan supérieur pour inviter plus de membres.");
        }
    }

    private void checkWorkspaceLimit(PlanType plan, long current) {
        long limit = workspaceLimitFor(plan);
        if (current >= limit) {
            throw new IllegalStateException(
                "Limite de workspaces atteinte pour votre plan (" + limit + " max)");
        }
    }

    /**
     * Usage vs limites pour un workspace (PROD-4.2). Source de vérité unique côté back
     * (le front consomme cet endpoint au lieu de dupliquer les limites). -1 = illimité.
     */
    @Transactional(readOnly = true)
    public WorkspaceUsageResponse getUsage(String slug, Long requestingUserId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertIsMember(workspace, requestingUserId);

        User requester = userRepository.findById(requestingUserId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        PlanType ownerPlan = workspace.getOwner().getPlanType();
        long membersUsed     = workspaceMemberRepository.findByWorkspaceId(workspace.getId()).size();
        long workspacesUsed  = workspaceRepository.countByMemberId(requestingUserId);

        return WorkspaceUsageResponse.builder()
            .plan(ownerPlan != null ? ownerPlan.name() : PlanType.FREE.name())
            .membersUsed(membersUsed)
            .membersLimit(unlimitedToMinusOne(memberLimitFor(ownerPlan)))
            .workspacesUsed(workspacesUsed)
            .workspacesLimit(unlimitedToMinusOne(workspaceLimitFor(requester.getPlanType())))
            .build();
    }

    private long unlimitedToMinusOne(long limit) {
        return limit == Long.MAX_VALUE ? -1 : limit;
    }

    /**
     * Journal d'audit du workspace (RGPD C11.1 / sécurité C21) — réservé OWNER/ADMIN.
     */
    @Transactional(readOnly = true)
    public List<AuditLogResponse> listAuditLogs(String slug, Long requestingUserId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        WorkspaceMember member = workspaceMemberRepository
            .findByWorkspaceIdAndUserId(workspace.getId(), requestingUserId)
            .orElseThrow(() -> new ForbiddenException("Accès refusé au workspace"));
        if (member.getRole() != WorkspaceRole.OWNER && member.getRole() != WorkspaceRole.ADMIN) {
            throw new ForbiddenException("Le journal d'audit est réservé aux administrateurs");
        }
        return auditService.listForWorkspace(workspace.getId(), 100).stream()
            .map(AuditLogResponse::from)
            .toList();
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

        long memberCount = workspaceMemberRepository.findByWorkspaceId(workspaceId).size();
        checkMemberLimit(workspace.getOwner().getPlanType(), memberCount);

        User inviter = userRepository.findById(requestingUserId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        WorkspaceRole role = request.getRole() != null ? request.getRole() : WorkspaceRole.MEMBER;
        if (role == WorkspaceRole.OWNER) {
            throw new IllegalStateException("Impossible d'inviter quelqu'un en tant que OWNER");
        }

        WorkspaceMember member = WorkspaceMember.builder()
            .workspace(workspace)
            .user(invitee)
            .role(role)
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
        WorkspaceMemberResponse saved = toMemberResponse(workspaceMemberRepository.save(member));
        auditService.record(workspaceId, requestingUserId, AuditService.ROLE_CHANGED,
            "WorkspaceMember", String.valueOf(memberId), Map.of("role", request.getRole().name()));
        return saved;
    }

    /**
     * Supprime définitivement un workspace et toutes ses données (cascade DB via les FK
     * {@code ON DELETE CASCADE}). Seul l'OWNER peut le faire.
     */
    @Transactional
    public void deleteWorkspace(Long workspaceId, Long requestingUserId) {
        Workspace workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        assertIsOwner(workspace, requestingUserId);
        auditService.record(null, requestingUserId, AuditService.WORKSPACE_DELETED,
            "Workspace", String.valueOf(workspaceId), Map.of("name", workspace.getName()));
        workspaceRepository.delete(workspace);
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
        auditService.record(workspaceId, requestingUserId, AuditService.MEMBER_REMOVED,
            "WorkspaceMember", String.valueOf(memberId),
            Map.of("removedUserId", String.valueOf(target.getUser().getId())));
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
            .uuid(workspace.getUuid().toString())
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
