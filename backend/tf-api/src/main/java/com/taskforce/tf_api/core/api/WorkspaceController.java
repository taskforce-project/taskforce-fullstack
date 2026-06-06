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

import com.taskforce.tf_api.core.dto.request.CreateWorkspaceRequest;
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
 * Routes scopées par slug : /api/workspaces/:slug/*
 * Rétrocompatibilité via /api/workspaces/current
 */
@RestController
@RequestMapping("/api/workspaces")
@RequiredArgsConstructor
@Slf4j
public class WorkspaceController {

    private final WorkspaceService workspaceService;
    private final UserRepository userRepository;

    // -------------------------------------------------------------------------
    // Liste et création
    // -------------------------------------------------------------------------

    /**
     * GET /api/workspaces
     * Liste tous les workspaces dont l'utilisateur est membre.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<WorkspaceResponse>>> listMyWorkspaces(
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<WorkspaceResponse> workspaces = workspaceService.listWorkspacesByUser(userId);
        return ResponseEntity.ok(ApiResponse.success("Workspaces récupérés", workspaces));
    }

    /**
     * POST /api/workspaces
     * Crée un nouveau workspace.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<WorkspaceResponse>> createWorkspace(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody CreateWorkspaceRequest request
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse response = workspaceService.createNewWorkspace(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Workspace créé", response));
    }

    // -------------------------------------------------------------------------
    // Accès par slug
    // -------------------------------------------------------------------------

    /**
     * GET /api/workspaces/:slug
     * Retourne un workspace par son slug (doit être membre).
     */
    @GetMapping("/{slug}")
    public ResponseEntity<ApiResponse<WorkspaceResponse>> getBySlug(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse response = workspaceService.getWorkspaceBySlug(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Workspace récupéré", response));
    }

    /**
     * PATCH /api/workspaces/:slug
     * Met à jour le nom, la description ou le logo.
     */
    @PatchMapping("/{slug}")
    public ResponseEntity<ApiResponse<WorkspaceResponse>> updateWorkspace(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @Valid @RequestBody UpdateWorkspaceRequest request
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceBySlug(slug, userId);
        WorkspaceResponse response = workspaceService.updateWorkspace(ws.getId(), userId, request);
        return ResponseEntity.ok(ApiResponse.success("Workspace mis à jour", response));
    }

    /**
     * GET /api/workspaces/:slug/members
     * Liste tous les membres du workspace.
     */
    @GetMapping("/{slug}/members")
    public ResponseEntity<ApiResponse<List<WorkspaceMemberResponse>>> getMembers(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceBySlug(slug, userId);
        List<WorkspaceMemberResponse> members = workspaceService.getMembers(ws.getId(), userId);
        return ResponseEntity.ok(ApiResponse.success("Membres récupérés", members));
    }

    /**
     * POST /api/workspaces/:slug/members/invite
     * Invite un utilisateur existant dans le workspace.
     */
    @PostMapping("/{slug}/members/invite")
    public ResponseEntity<ApiResponse<WorkspaceMemberResponse>> inviteMember(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @Valid @RequestBody InviteMemberRequest request
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceBySlug(slug, userId);
        WorkspaceMemberResponse member = workspaceService.inviteMember(ws.getId(), userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Membre ajouté", member));
    }

    /**
     * PATCH /api/workspaces/:slug/members/:memberId/role
     */
    @PatchMapping("/{slug}/members/{memberId}/role")
    public ResponseEntity<ApiResponse<WorkspaceMemberResponse>> updateMemberRole(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long memberId,
        @Valid @RequestBody UpdateMemberRoleRequest request
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceBySlug(slug, userId);
        WorkspaceMemberResponse member = workspaceService.updateMemberRole(ws.getId(), userId, memberId, request);
        return ResponseEntity.ok(ApiResponse.success("Rôle mis à jour", member));
    }

    /**
     * DELETE /api/workspaces/:slug/members/:memberId
     */
    @DeleteMapping("/{slug}/members/{memberId}")
    public ResponseEntity<ApiResponse<Void>> removeMember(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long memberId
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse ws = workspaceService.getWorkspaceBySlug(slug, userId);
        workspaceService.removeMember(ws.getId(), userId, memberId);
        return ResponseEntity.ok(ApiResponse.success("Membre retiré", null));
    }

    // -------------------------------------------------------------------------
    // Rétrocompatibilité
    // -------------------------------------------------------------------------

    /**
     * GET /api/workspaces/current — rétrocompatibilité
     * Retourne le premier workspace de l'utilisateur.
     */
    @GetMapping("/current")
    public ResponseEntity<ApiResponse<WorkspaceResponse>> getCurrent(
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        WorkspaceResponse response = workspaceService.getWorkspaceByUserId(userId);
        return ResponseEntity.ok(ApiResponse.success("Workspace récupéré", response));
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
