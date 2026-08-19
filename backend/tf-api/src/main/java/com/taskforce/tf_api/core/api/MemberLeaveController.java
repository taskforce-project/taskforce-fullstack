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

import com.taskforce.tf_api.core.dto.request.CreateLeaveRequest;
import com.taskforce.tf_api.core.dto.response.MemberLeaveResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.MemberLeaveService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour les indisponibilités d'un membre (US-006).
 * Routes scopées par workspace slug + membre :
 * /api/workspaces/{slug}/members/{userId}/leaves/*
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/members/{userId}/leaves")
@RequiredArgsConstructor
@Slf4j
public class MemberLeaveController {

    private final MemberLeaveService memberLeaveService;
    private final UserRepository userRepository;

    /**
     * GET /api/workspaces/{slug}/members/{userId}/leaves
     * Liste les indisponibilités du membre.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<MemberLeaveResponse>>> listLeaves(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long userId
    ) {
        Long requesterId = resolveUserId(jwt);
        List<MemberLeaveResponse> leaves = memberLeaveService.listLeaves(slug, userId, requesterId);
        return ResponseEntity.ok(ApiResponse.success("Indisponibilités récupérées", leaves));
    }

    /**
     * POST /api/workspaces/{slug}/members/{userId}/leaves
     * Crée une indisponibilité pour le membre.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<MemberLeaveResponse>> createLeave(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long userId,
        @Valid @RequestBody CreateLeaveRequest request
    ) {
        Long requesterId = resolveUserId(jwt);
        MemberLeaveResponse created = memberLeaveService.createLeave(slug, userId, requesterId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Indisponibilité créée", created));
    }

    /**
     * DELETE /api/workspaces/{slug}/members/{userId}/leaves/{leaveId}
     * Supprime une indisponibilité du membre.
     */
    @DeleteMapping("/{leaveId}")
    public ResponseEntity<ApiResponse<Void>> deleteLeave(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long userId,
        @PathVariable Long leaveId
    ) {
        Long requesterId = resolveUserId(jwt);
        memberLeaveService.deleteLeave(slug, userId, leaveId, requesterId);
        return ResponseEntity.ok(ApiResponse.success("Indisponibilité supprimée", null));
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
