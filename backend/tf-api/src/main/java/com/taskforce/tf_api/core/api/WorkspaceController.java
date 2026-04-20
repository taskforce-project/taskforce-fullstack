package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.InviteMemberRequest;
import com.taskforce.tf_api.core.dto.request.UpdateMemberRoleRequest;
import com.taskforce.tf_api.core.dto.request.UpdateWorkspaceRequest;
import com.taskforce.tf_api.core.dto.response.WorkspaceMemberResponse;
import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour les opérations sur les workspaces.
 * "current" = le workspace dont l'utilisateur connecté est propriétaire.
 */
@RestController
@RequestMapping("/api/workspaces")
@RequiredArgsConstructor
@Slf4j
public class WorkspaceController {

    private final WorkspaceService workspaceService;
    private final UserRepository userRepository;

    /**
     * GET /api/workspaces/current
     * Retourne le workspace de l'utilisateur connecté.
     */
    @GetMapping("/current")
    public ResponseEntity<ApiResponse<WorkspaceResponse>> getCurrent(
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse response = workspaceService.getWorkspaceByUserId(userId);
        return ResponseEntity.ok(ApiResponse.success("Workspace récupéré", response));
    }

    /**
     * PATCH /api/workspaces/current
     * Met à jour le nom, la description ou le logo du workspace.
     */
    @PatchMapping("/current")
    public ResponseEntity<ApiResponse<WorkspaceResponse>> updateCurrent(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody UpdateWorkspaceRequest request
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceByUserId(userId);
        WorkspaceResponse response = workspaceService.updateWorkspace(ws.getId(), userId, request);
        return ResponseEntity.ok(ApiResponse.success("Workspace mis à jour", response));
    }

    /**
     * GET /api/workspaces/current/members
     * Liste tous les membres du workspace.
     */
    @GetMapping("/current/members")
    public ResponseEntity<ApiResponse<List<WorkspaceMemberResponse>>> getMembers(
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceByUserId(userId);
        List<WorkspaceMemberResponse> members = workspaceService.getMembers(ws.getId(), userId);
        return ResponseEntity.ok(ApiResponse.success("Membres récupérés", members));
    }

    /**
     * POST /api/workspaces/current/members/invite
     * Invite un utilisateur existant dans le workspace.
     */
    @PostMapping("/current/members/invite")
    public ResponseEntity<ApiResponse<WorkspaceMemberResponse>> inviteMember(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody InviteMemberRequest request
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceByUserId(userId);
        WorkspaceMemberResponse member = workspaceService.inviteMember(ws.getId(), userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Membre ajouté", member));
    }

    /**
     * PATCH /api/workspaces/current/members/{memberId}/role
     * Change le rôle d'un membre (OWNER uniquement).
     */
    @PatchMapping("/current/members/{memberId}/role")
    public ResponseEntity<ApiResponse<WorkspaceMemberResponse>> updateMemberRole(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable Long memberId,
        @Valid @RequestBody UpdateMemberRoleRequest request
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceByUserId(userId);
        WorkspaceMemberResponse member = workspaceService.updateMemberRole(ws.getId(), userId, memberId, request);
        return ResponseEntity.ok(ApiResponse.success("Rôle mis à jour", member));
    }

    /**
     * DELETE /api/workspaces/current/members/{memberId}
     * Retire un membre du workspace.
     */
    @DeleteMapping("/current/members/{memberId}")
    public ResponseEntity<ApiResponse<Void>> removeMember(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable Long memberId
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceByUserId(userId);
        workspaceService.removeMember(ws.getId(), userId, memberId);
        return ResponseEntity.ok(ApiResponse.success("Membre retiré", null));
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaim("sub");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
