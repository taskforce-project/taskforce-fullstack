package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.CreateInvitationRequest;
import com.taskforce.tf_api.core.dto.response.IncomingInvitationResponse;
import com.taskforce.tf_api.core.dto.response.InvitationPreviewResponse;
import com.taskforce.tf_api.core.dto.response.InvitationResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WorkspaceInvitationService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Invitations workspace par email (PROD-3.5).
 * - Routes admin scopées par workspace : /api/workspaces/{slug}/invitations
 * - Routes par token : /api/invitations/{token} (preview public) et /accept (authentifié)
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class InvitationController {

    private final WorkspaceInvitationService invitationService;
    private final UserRepository userRepository;

    // ---- Admin (workspace-scoped) -------------------------------------------

    @PostMapping("/workspaces/{slug}/invitations")
    public ResponseEntity<ApiResponse<InvitationResponse>> create(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @Valid @RequestBody CreateInvitationRequest request
    ) {
        Long userId = resolveUserId(jwt);
        InvitationResponse invitation = invitationService.createInvitation(slug, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Invitation envoyée", invitation));
    }

    @GetMapping("/workspaces/{slug}/invitations")
    public ResponseEntity<ApiResponse<List<InvitationResponse>>> listPending(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Invitations en attente", invitationService.listPending(slug, userId)));
    }

    @DeleteMapping("/workspaces/{slug}/invitations/{invitationId}")
    public ResponseEntity<ApiResponse<Void>> revoke(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long invitationId
    ) {
        Long userId = resolveUserId(jwt);
        invitationService.revokeInvitation(slug, userId, invitationId);
        return ResponseEntity.ok(ApiResponse.success("Invitation annulée", null));
    }

    // ---- Par token ----------------------------------------------------------

    /** Public : résout le token pour pré-remplir la page d'inscription. */
    @GetMapping("/invitations/{token}")
    public ResponseEntity<ApiResponse<InvitationPreviewResponse>> preview(@PathVariable String token) {
        return ResponseEntity.ok(ApiResponse.success(
            "Invitation", invitationService.preview(token)));
    }

    /** Authentifié : l'utilisateur courant accepte l'invitation (email doit matcher). */
    @PostMapping("/invitations/{token}/accept")
    public ResponseEntity<ApiResponse<Void>> accept(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String token
    ) {
        Long userId = resolveUserId(jwt);
        invitationService.acceptInvitation(token, userId);
        return ResponseEntity.ok(ApiResponse.success("Invitation acceptée", null));
    }

    // ---- Mes invitations reçues (in-app, sans token) ------------------------

    /** Invitations PENDING adressées à l'utilisateur courant (bannière d'approbation in-app). */
    @GetMapping("/invitations/mine")
    public ResponseEntity<ApiResponse<List<IncomingInvitationResponse>>> listMine(
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Invitations reçues", invitationService.listMyPendingInvitations(userId)));
    }

    /** L'utilisateur courant accepte explicitement une de ses invitations (par identifiant). */
    @PostMapping("/invitations/mine/{invitationId}/accept")
    public ResponseEntity<ApiResponse<Void>> acceptMine(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable Long invitationId
    ) {
        Long userId = resolveUserId(jwt);
        invitationService.acceptMyInvitation(userId, invitationId);
        return ResponseEntity.ok(ApiResponse.success("Invitation acceptée", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
