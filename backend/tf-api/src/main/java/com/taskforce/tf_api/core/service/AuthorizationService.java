package com.taskforce.tf_api.core.service;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import lombok.RequiredArgsConstructor;

/**
 * Point central d'autorisation (RBAC) — PROD-3.2.
 *
 * <p>Vérifie l'appartenance au workspace et les rôles, de façon cohérente, pour combler
 * les trous d'autorisation (IDOR) où des services exposaient des données workspace sans
 * vérifier que l'appelant en est membre. À terme : socle pour des permissions granulaires
 * (PROD-3.9) et une config entreprise/on-premise (PROD-3.10).</p>
 */
@Service
@RequiredArgsConstructor
public class AuthorizationService {

    private final WorkspaceMemberRepository workspaceMemberRepository;

    /** Exige que l'utilisateur soit membre du workspace, sinon 403. */
    public WorkspaceMember requireMember(Long workspaceId, Long userId) {
        return workspaceMemberRepository.findByWorkspaceIdAndUserId(workspaceId, userId)
            .orElseThrow(() -> new ForbiddenException(
                "Accès refusé : vous n'êtes pas membre de cet espace de travail"));
    }

    /** Exige que l'utilisateur soit membre ET porte l'un des rôles autorisés, sinon 403. */
    public WorkspaceMember requireRole(Long workspaceId, Long userId, WorkspaceRole... allowedRoles) {
        WorkspaceMember member = requireMember(workspaceId, userId);
        for (WorkspaceRole role : allowedRoles) {
            if (member.getRole() == role) {
                return member;
            }
        }
        throw new ForbiddenException("Permission insuffisante pour cette action");
    }

    /** Exige un rôle de gestion (OWNER ou ADMIN), sinon 403. */
    public WorkspaceMember requireManager(Long workspaceId, Long userId) {
        return requireRole(workspaceId, userId, WorkspaceRole.OWNER, WorkspaceRole.ADMIN);
    }

    // NB : le gating par plan (features payantes) vit dans PlanFeatureService (PROD-4.4).

    /** true si l'utilisateur est membre (sans lever d'exception). */
    public boolean isMember(Long workspaceId, Long userId) {
        return workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId);
    }
}
