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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeEdgeRequest;
import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.BrainOverviewResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeEdgeResponse;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Brain OS — graphe de connaissance d'un workspace.
 * Routes scopées par slug : /api/workspaces/{slug}/brain/*
 * L'accès membre est garanti par WorkspaceAccessInterceptor + re-vérifié au niveau service.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/brain")
@RequiredArgsConstructor
public class KnowledgeController {

    private final KnowledgeService knowledgeService;
    private final UserRepository   userRepository;

    // ── Vue d'ensemble (graphe complet) ──────────────────────────────────────

    @GetMapping
    public ResponseEntity<ApiResponse<BrainOverviewResponse>> getOverview(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Brain récupéré",
            knowledgeService.getOverview(slug, userId)));
    }

    // ── Nodes ────────────────────────────────────────────────────────────────

    @GetMapping("/nodes")
    public ResponseEntity<ApiResponse<List<KnowledgeNodeResponse>>> listNodes(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @RequestParam(required = false) String domain
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Nodes récupérés",
            knowledgeService.listNodes(slug, userId, domain)));
    }

    @GetMapping("/nodes/{nodeId}")
    public ResponseEntity<ApiResponse<KnowledgeNodeResponse>> getNode(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long nodeId
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Node récupéré",
            knowledgeService.getNode(slug, nodeId, userId)));
    }

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

    // ── Edges ─────────────────────────────────────────────────────────────────

    @PostMapping("/edges")
    public ResponseEntity<ApiResponse<KnowledgeEdgeResponse>> createEdge(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @Valid @RequestBody CreateKnowledgeEdgeRequest request
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Relation créée",
            knowledgeService.createEdge(slug, userId, request)));
    }

    @DeleteMapping("/edges/{edgeId}")
    public ResponseEntity<ApiResponse<Void>> deleteEdge(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long edgeId
    ) {
        Long userId = resolveUserId(jwt);
        knowledgeService.deleteEdge(slug, edgeId, userId);
        return ResponseEntity.ok(ApiResponse.success("Relation supprimée", null));
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
