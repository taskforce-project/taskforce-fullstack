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

import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRelationRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueStatusRequest;
import com.taskforce.tf_api.core.dto.request.ReorderStatusesRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueStatusRequest;
import com.taskforce.tf_api.core.dto.response.IssueActivityResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.IssueRelationResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.IssueTypeResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour les issues.
 * Toutes les routes sont scopées par workspace + projet :
 * /api/workspaces/{slug}/projects/{projectId}/issues/*
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/projects/{projectId}/issues")
@RequiredArgsConstructor
@Slf4j
public class IssueController {

    private final IssueService   issueService;
    private final UserRepository userRepository;

    // =========================================================================
    // Issues
    // =========================================================================

    @GetMapping
    public ResponseEntity<ApiResponse<List<IssueResponse>>> listIssues(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueResponse> issues = issueService.listIssues(slug, projectId, userId);
        return ResponseEntity.ok(ApiResponse.success("Issues récupérées", issues));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<IssueResponse>> createIssue(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @Valid @RequestBody CreateIssueRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueResponse issue = issueService.createIssue(slug, projectId, request, userId);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Issue créée", issue));
    }

    @GetMapping("/{issueId}")
    public ResponseEntity<ApiResponse<IssueResponse>> getIssue(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueResponse issue = issueService.getIssue(slug, projectId, issueId, userId);
        return ResponseEntity.ok(ApiResponse.success("Issue récupérée", issue));
    }

    @PatchMapping("/{issueId}")
    public ResponseEntity<ApiResponse<IssueResponse>> updateIssue(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @Valid @RequestBody UpdateIssueRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueResponse issue = issueService.updateIssue(slug, projectId, issueId, request, userId);
        return ResponseEntity.ok(ApiResponse.success("Issue mise à jour", issue));
    }

    @DeleteMapping("/{issueId}")
    public ResponseEntity<ApiResponse<Void>> deleteIssue(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        issueService.deleteIssue(slug, projectId, issueId, userId);
        return ResponseEntity.ok(ApiResponse.success("Issue supprimée", null));
    }

    // =========================================================================
    // Statuts
    // =========================================================================

    @GetMapping("/statuses")
    public ResponseEntity<ApiResponse<List<IssueStatusResponse>>> listStatuses(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueStatusResponse> statuses = issueService.listStatuses(slug, projectId, userId);
        return ResponseEntity.ok(ApiResponse.success("Statuts récupérés", statuses));
    }

    @PostMapping("/statuses")
    public ResponseEntity<ApiResponse<IssueStatusResponse>> createStatus(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @Valid @RequestBody CreateIssueStatusRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueStatusResponse status = issueService.createStatus(slug, projectId, request, userId);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Statut créé", status));
    }

    @PatchMapping("/statuses/{statusId}")
    public ResponseEntity<ApiResponse<IssueStatusResponse>> updateStatus(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long statusId,
        @Valid @RequestBody UpdateIssueStatusRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueStatusResponse status = issueService.updateStatus(slug, projectId, statusId, request, userId);
        return ResponseEntity.ok(ApiResponse.success("Statut mis à jour", status));
    }

    @DeleteMapping("/statuses/{statusId}")
    public ResponseEntity<ApiResponse<Void>> deleteStatus(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long statusId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        issueService.deleteStatus(slug, projectId, statusId, userId);
        return ResponseEntity.ok(ApiResponse.success("Statut supprimé", null));
    }

    /**
     * POST /api/workspaces/{slug}/projects/{projectId}/issues/statuses/reorder
     * Réordonne tous les statuts d'un projet en une seule requête.
     */
    @PostMapping("/statuses/reorder")
    public ResponseEntity<ApiResponse<List<IssueStatusResponse>>> reorderStatuses(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @Valid @RequestBody ReorderStatusesRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueStatusResponse> statuses = issueService.reorderStatuses(slug, projectId, request, userId);
        return ResponseEntity.ok(ApiResponse.success("Statuts réordonnés", statuses));
    }

    // =========================================================================
    // Types
    // =========================================================================

    @GetMapping("/types")
    public ResponseEntity<ApiResponse<List<IssueTypeResponse>>> listTypes(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueTypeResponse> types = issueService.listTypes(slug, projectId, userId);
        return ResponseEntity.ok(ApiResponse.success("Types récupérés", types));
    }

    // =========================================================================
    // Commentaires
    // =========================================================================

    @GetMapping("/{issueId}/comments")
    public ResponseEntity<ApiResponse<List<IssueCommentResponse>>> listComments(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueCommentResponse> comments = issueService.listComments(slug, projectId, issueId, userId);
        return ResponseEntity.ok(ApiResponse.success("Commentaires récupérés", comments));
    }

    @PostMapping("/{issueId}/comments")
    public ResponseEntity<ApiResponse<IssueCommentResponse>> addComment(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @Valid @RequestBody CreateIssueCommentRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueCommentResponse comment = issueService.addComment(slug, projectId, issueId, request, userId);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Commentaire ajouté", comment));
    }

    @PatchMapping("/{issueId}/comments/{commentId}")
    public ResponseEntity<ApiResponse<IssueCommentResponse>> updateComment(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @PathVariable Long commentId,
        @Valid @RequestBody CreateIssueCommentRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueCommentResponse comment = issueService.updateComment(slug, projectId, issueId, commentId, request, userId);
        return ResponseEntity.ok(ApiResponse.success("Commentaire mis à jour", comment));
    }

    @DeleteMapping("/{issueId}/comments/{commentId}")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @PathVariable Long commentId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        issueService.deleteComment(slug, projectId, issueId, commentId, userId);
        return ResponseEntity.ok(ApiResponse.success("Commentaire supprimé", null));
    }

    // =========================================================================
    // Activité
    // =========================================================================

    @GetMapping("/{issueId}/activity")
    public ResponseEntity<ApiResponse<List<IssueActivityResponse>>> listActivity(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueActivityResponse> activities = issueService.listActivity(slug, projectId, issueId, userId);
        return ResponseEntity.ok(ApiResponse.success("Activité récupérée", activities));
    }

    // =========================================================================
    // Relations
    // =========================================================================

    @GetMapping("/{issueId}/relations")
    public ResponseEntity<ApiResponse<List<IssueRelationResponse>>> listRelations(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueRelationResponse> relations = issueService.listRelations(slug, projectId, issueId, userId);
        return ResponseEntity.ok(ApiResponse.success("Relations récupérées", relations));
    }

    @PostMapping("/{issueId}/relations")
    public ResponseEntity<ApiResponse<IssueRelationResponse>> addRelation(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @Valid @RequestBody CreateIssueRelationRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        IssueRelationResponse relation = issueService.addRelation(slug, projectId, issueId, request, userId);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Relation créée", relation));
    }

    @DeleteMapping("/{issueId}/relations/{relationId}")
    public ResponseEntity<ApiResponse<Void>> deleteRelation(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long issueId,
        @PathVariable Long relationId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        issueService.deleteRelation(slug, projectId, issueId, relationId, userId);
        return ResponseEntity.ok(ApiResponse.success("Relation supprimée", null));
    }

    // =========================================================================
    // Utilitaires
    // =========================================================================

    private Long resolveUserId(Jwt jwt) {
        String keycloakId = jwt.getSubject();
        User user = userRepository.findByKeycloakId(keycloakId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
