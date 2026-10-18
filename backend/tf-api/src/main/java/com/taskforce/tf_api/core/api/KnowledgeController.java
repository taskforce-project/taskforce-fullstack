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

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.MoveNodeRequest;
import com.taskforce.tf_api.core.dto.request.SearchBrainRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.BrainOverviewResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeSearchHit;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Brain OS — pages de connaissance d'un workspace.
 * Routes scopées par slug : /api/workspaces/{slug}/brain/*
 * L'accès membre est garanti par WorkspaceAccessInterceptor + re-vérifié au niveau service.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/brain")
@RequiredArgsConstructor
public class KnowledgeController {

    private final KnowledgeService   knowledgeService;
    private final BrainSearchService brainSearchService;
    private final UserRepository     userRepository;

    // ── Vue d'ensemble (pages + liens) ───────────────────────────────────────

    @GetMapping
    public ResponseEntity<ApiResponse<BrainOverviewResponse>> getOverview(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Brain récupéré",
            knowledgeService.getOverview(slug, userId)));
    }

    // ── Recherche sémantique ─────────────────────────────────────────────────

    @PostMapping("/search")
    public ResponseEntity<ApiResponse<List<KnowledgeSearchHit>>> search(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @Valid @RequestBody SearchBrainRequest request
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Résultats",
            brainSearchService.search(slug, userId, request.getQuery(), request.getTopK(), request.getDomain())));
    }

    // ── Nodes ────────────────────────────────────────────────────────────────

    @PostMapping("/nodes")
    public ResponseEntity<ApiResponse<KnowledgeNodeResponse>> createNode(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @Valid @RequestBody CreateKnowledgeNodeRequest request
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Node créé",
            knowledgeService.createNode(slug, userId, request)));
    }

    @PatchMapping("/nodes/{nodeId}")
    public ResponseEntity<ApiResponse<KnowledgeNodeResponse>> updateNode(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long nodeId,
        @Valid @RequestBody UpdateKnowledgeNodeRequest request
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Node mis à jour",
            knowledgeService.updateNode(slug, nodeId, userId, request)));
    }

    @PatchMapping("/nodes/{nodeId}/move")
    public ResponseEntity<ApiResponse<KnowledgeNodeResponse>> moveNode(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long nodeId,
        @Valid @RequestBody MoveNodeRequest request
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Node déplacé",
            knowledgeService.moveNode(slug, nodeId, userId, request)));
    }

    @DeleteMapping("/nodes/{nodeId}")
    public ResponseEntity<ApiResponse<Void>> deleteNode(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long nodeId
    ) {
        Long userId = resolveUserId(jwt);
        knowledgeService.deleteNode(slug, nodeId, userId);
        return ResponseEntity.ok(ApiResponse.success("Node supprimé", null));
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
