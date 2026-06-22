package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateInvitationRequest;
import com.taskforce.tf_api.core.dto.response.InvitationPreviewResponse;
import com.taskforce.tf_api.core.dto.response.InvitationResponse;
import com.taskforce.tf_api.core.enums.InvitationStatus;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceInvitation;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceInvitationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Invitations workspace par email (PROD-3.5).
 * - Un admin/owner invite un email (avec ou sans compte) → token + email d'invitation.
 * - À l'inscription (ou via le token), l'invité rejoint automatiquement le workspace.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkspaceInvitationService {

    private static final int EXPIRY_DAYS = 7;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final WorkspaceInvitationRepository invitationRepository;
    private final UserRepository userRepository;
    private final AuthorizationService authorizationService;
    private final EmailService emailService;

    @Value("${app.url:http://localhost:3000}")
    private String appUrl;

    // -------------------------------------------------------------------------
    // Création (admin/owner)
    // -------------------------------------------------------------------------

    @Transactional
    public InvitationResponse createInvitation(String slug, Long requesterId, CreateInvitationRequest request) {
        Workspace workspace = resolveWorkspace(slug);
        authorizationService.requireManager(workspace.getId(), requesterId);

        String email = request.getEmail().trim().toLowerCase();
        WorkspaceRole role = request.getRole() != null ? request.getRole() : WorkspaceRole.MEMBER;
        if (role == WorkspaceRole.OWNER) {
            throw new BusinessException("Impossible d'inviter quelqu'un en tant que OWNER");
        }

        // Déjà membre ?
        userRepository.findByEmail(email).ifPresent(u -> {
            if (workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), u.getId())) {
                throw new BusinessException("Cet utilisateur est déjà membre du workspace");
            }
        });

        // Invitation PENDING existante → on la renvoie (idempotent).
        WorkspaceInvitation invitation = invitationRepository
            .findByWorkspaceIdAndEmailIgnoreCaseAndStatus(workspace.getId(), email, InvitationStatus.PENDING)
            .map(existing -> {
                existing.setRole(role);
                existing.setExpiresAt(LocalDateTime.now().plusDays(EXPIRY_DAYS));
                return existing;
            })
            .orElseGet(() -> WorkspaceInvitation.builder()
                .workspace(workspace)
                .invitedBy(userRepository.findById(requesterId).orElse(null))
                .email(email)
                .role(role)
                .token(UUID.randomUUID().toString().replace("-", ""))
                .status(InvitationStatus.PENDING)
                .expiresAt(LocalDateTime.now().plusDays(EXPIRY_DAYS))
                .build());

        invitation = invitationRepository.save(invitation);

        // Envoi d'email best-effort (ne casse pas l'invitation si SMTP indisponible).
        String inviterName = invitation.getInvitedBy() != null
            ? (invitation.getInvitedBy().getDisplayName() != null
                ? invitation.getInvitedBy().getDisplayName()
                : invitation.getInvitedBy().getEmail())
            : "Un membre";
        String acceptUrl = appUrl + "/invitations/" + invitation.getToken();
        emailService.sendWorkspaceInvitationEmail(email, inviterName, workspace.getName(), acceptUrl);

        log.info("Invitation créée pour {} sur le workspace {}", email, slug);
        return InvitationResponse.from(invitation);
    }

    @Transactional(readOnly = true)
    public List<InvitationResponse> listPending(String slug, Long requesterId) {
        Workspace workspace = resolveWorkspace(slug);
        authorizationService.requireManager(workspace.getId(), requesterId);

        return invitationRepository
            .findByWorkspaceIdAndStatus(workspace.getId(), InvitationStatus.PENDING)
            .stream()
            .map(InvitationResponse::from)
            .collect(Collectors.toList());
    }

    @Transactional
    public void revokeInvitation(String slug, Long requesterId, Long invitationId) {
        Workspace workspace = resolveWorkspace(slug);
        authorizationService.requireManager(workspace.getId(), requesterId);

        WorkspaceInvitation invitation = invitationRepository.findById(invitationId)
            .orElseThrow(() -> new ResourceNotFoundException("Invitation introuvable"));
        if (!invitation.getWorkspace().getId().equals(workspace.getId())) {
            throw new BusinessException("Cette invitation n'appartient pas à ce workspace");
        }
        invitation.setStatus(InvitationStatus.REVOKED);
        invitationRepository.save(invitation);
    }

    // -------------------------------------------------------------------------
    // Acceptation
    // -------------------------------------------------------------------------

    /** Vue publique pour pré-remplir la page d'inscription. */
    @Transactional(readOnly = true)
    public InvitationPreviewResponse preview(String token) {
        WorkspaceInvitation invitation = invitationRepository.findByToken(token).orElse(null);
        boolean valid = invitation != null
            && invitation.getStatus() == InvitationStatus.PENDING
            && !invitation.isExpired();

        if (invitation == null) {
            return InvitationPreviewResponse.builder().valid(false).build();
        }

        return InvitationPreviewResponse.builder()
            .email(invitation.getEmail())
            .workspaceName(invitation.getWorkspace().getName())
            .role(invitation.getRole())
            .valid(valid)
            .accountExists(userRepository.findByEmail(invitation.getEmail()).isPresent())
            .build();
    }

    /** Acceptation explicite par un utilisateur authentifié (le token doit matcher son email). */
    @Transactional
    public void acceptInvitation(String token, Long userId) {
        WorkspaceInvitation invitation = invitationRepository.findByToken(token)
            .orElseThrow(() -> new ResourceNotFoundException("Invitation introuvable"));

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        if (!user.getEmail().equalsIgnoreCase(invitation.getEmail())) {
            throw new BusinessException("Cette invitation ne correspond pas à votre adresse email");
        }
        if (invitation.getStatus() != InvitationStatus.PENDING) {
            throw new BusinessException("Cette invitation n'est plus valide");
        }
        if (invitation.isExpired()) {
            invitation.setStatus(InvitationStatus.EXPIRED);
            invitationRepository.save(invitation);
            throw new BusinessException("Cette invitation a expiré");
        }

        joinWorkspace(invitation, user);
    }

    /**
     * Accepte toutes les invitations PENDING correspondant à l'email de l'utilisateur.
     * Appelé après l'inscription/le premier login. Best-effort (ne casse jamais l'inscription).
     */
    @Transactional
    public void acceptPendingInvitations(User user) {
        try {
            List<WorkspaceInvitation> pending = invitationRepository
                .findByEmailIgnoreCaseAndStatus(user.getEmail(), InvitationStatus.PENDING);
            for (WorkspaceInvitation invitation : pending) {
                if (invitation.isExpired()) {
                    invitation.setStatus(InvitationStatus.EXPIRED);
                    invitationRepository.save(invitation);
                    continue;
                }
                joinWorkspace(invitation, user);
            }
        } catch (Exception e) {
            log.error("Échec de l'acceptation auto des invitations pour {} : {}", user.getEmail(), e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void joinWorkspace(WorkspaceInvitation invitation, User user) {
        Long workspaceId = invitation.getWorkspace().getId();
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, user.getId())) {
            WorkspaceMember member = WorkspaceMember.builder()
                .workspace(invitation.getWorkspace())
                .user(user)
                .role(invitation.getRole())
                .invitedBy(invitation.getInvitedBy())
                .build();
            workspaceMemberRepository.save(member);
        }
        invitation.setStatus(InvitationStatus.ACCEPTED);
        invitation.setAcceptedAt(LocalDateTime.now());
        invitationRepository.save(invitation);
        log.info("{} a rejoint le workspace {} via invitation", user.getEmail(), workspaceId);
    }

    private Workspace resolveWorkspace(String slug) {
        return workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
    }
}
