package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateInvitationRequest;
import com.taskforce.tf_api.core.dto.response.IncomingInvitationResponse;
import com.taskforce.tf_api.core.dto.response.InvitationPreviewResponse;
import com.taskforce.tf_api.core.dto.response.InvitationResponse;
import com.taskforce.tf_api.core.enums.InvitationStatus;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceInvitation;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
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
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectService projectService;
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

        // Contexte projet optionnel : à l'acceptation, l'invité rejoint aussi ce projet.
        final Project project = request.getProjectId() == null ? null
            : projectRepository.findByIdAndWorkspaceId(request.getProjectId(), workspace.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable dans ce workspace"));
        final ProjectRole projectRole = project == null ? null
            : (request.getProjectRole() != null ? request.getProjectRole() : ProjectRole.MEMBER);

        // Plafond « façon GitHub » : projet privé + Free = collaborateurs limités. L'invitation ne
        // doit pas contourner la règle qui vivait dans l'ajout direct — on la vérifie dès l'invitation.
        if (project != null) {
            projectService.assertProjectSeatAvailable(project);
        }

        // Déjà membre ? — la cible détermine la garde (projet vs workspace).
        userRepository.findByEmail(email).ifPresent(u -> {
            if (project != null) {
                if (projectMemberRepository.existsByProjectIdAndUserId(project.getId(), u.getId())) {
                    throw new BusinessException("Cet utilisateur est déjà membre du projet");
                }
                // Un membre du workspace PEUT être invité à un projet — il devra accepter.
            } else if (workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), u.getId())) {
                throw new BusinessException("Cet utilisateur est déjà membre du workspace");
            }
        });

        // Invitation PENDING existante (workspace+email) → réutilisée (idempotent), re-ciblée au besoin.
        WorkspaceInvitation invitation = invitationRepository
            .findByWorkspaceIdAndEmailIgnoreCaseAndStatus(workspace.getId(), email, InvitationStatus.PENDING)
            .map(existing -> {
                existing.setRole(role);
                existing.setProject(project);
                existing.setProjectRole(projectRole);
                existing.setExpiresAt(LocalDateTime.now().plusDays(EXPIRY_DAYS));
                return existing;
            })
            .orElseGet(() -> WorkspaceInvitation.builder()
                .workspace(workspace)
                .invitedBy(userRepository.findById(requesterId).orElse(null))
                .email(email)
                .role(role)
                .project(project)
                .projectRole(projectRole)
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
     * Liste les invitations PENDING (non expirées) adressées à l'email de l'utilisateur courant.
     *
     * <p>Alimente la bannière « vous avez été invité » in-app. Depuis le passage à une acceptation
     * <b>explicite</b> (plus d'auto-rattachement silencieux à la connexion), c'est ce qui permet
     * d'accepter <b>sans dépendre de l'email</b> — indispensable pour un compte déjà existant.</p>
     */
    @Transactional(readOnly = true)
    public List<IncomingInvitationResponse> listMyPendingInvitations(Long userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return invitationRepository
            .findByEmailIgnoreCaseAndStatus(user.getEmail(), InvitationStatus.PENDING)
            .stream()
            .filter(inv -> !inv.isExpired())
            .map(IncomingInvitationResponse::from)
            .collect(Collectors.toList());
    }

    /**
     * Acceptation explicite d'une de SES invitations, par identifiant (l'invité clique « Accepter »
     * dans l'app). L'invitation doit viser l'email du demandeur — même garde-fou que
     * {@link #acceptInvitation(String, Long)}, mais sans exiger la connaissance du token.
     */
    @Transactional
    public void acceptMyInvitation(Long userId, Long invitationId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        WorkspaceInvitation invitation = invitationRepository.findById(invitationId)
            .orElseThrow(() -> new ResourceNotFoundException("Invitation introuvable"));

        if (!user.getEmail().equalsIgnoreCase(invitation.getEmail())) {
            throw new BusinessException("Cette invitation ne vous est pas adressée");
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
        // Invitation ciblant un projet : ajout au projet à l'acceptation (fini l'ajout direct).
        Project project = invitation.getProject();
        if (project != null
            && !projectMemberRepository.existsByProjectIdAndUserId(project.getId(), user.getId())) {
            // Le siège est réellement consommé ici : on re-vérifie le plafond au moment d'accepter.
            projectService.assertProjectSeatAvailable(project);
            projectMemberRepository.save(ProjectMember.builder()
                .project(project)
                .user(user)
                .role(invitation.getProjectRole() != null ? invitation.getProjectRole() : ProjectRole.MEMBER)
                .addedBy(invitation.getInvitedBy())
                .build());
        }
        invitation.setStatus(InvitationStatus.ACCEPTED);
        invitation.setAcceptedAt(LocalDateTime.now());
        invitationRepository.save(invitation);
        log.info("{} a rejoint le workspace {} via invitation{}", user.getEmail(), workspaceId,
            project != null ? " (+ projet " + project.getId() + ")" : "");
    }

    private Workspace resolveWorkspace(String slug) {
        return workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
    }
}
