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

import com.taskforce.tf_api.core.dto.request.AddIssueToCycleRequest;
import com.taskforce.tf_api.core.dto.request.CreateCycleRequest;
import com.taskforce.tf_api.core.dto.request.UpdateCycleRequest;
import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/workspaces/{slug}/projects/{projectId}/cycles")
@RequiredArgsConstructor
public class CycleController {

    private final CycleService    cycleService;
    private final UserRepository  userRepository;

    // =========================================================================
    // CRUD cycles
    // =========================================================================

    @GetMapping
    public ResponseEntity<ApiResponse<List<CycleResponse>>> listCycles(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<CycleResponse> cycles = cycleService.listCycles(slug, projectId, userId);
        return ResponseEntity.ok(ApiResponse.success("Cycles récupérés", cycles));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CycleResponse>> createCycle(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @Valid @RequestBody CreateCycleRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        CycleResponse cycle = cycleService.createCycle(slug, projectId, request, userId);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Cycle créé", cycle));
    }

    @GetMapping("/{cycleId}")
    public ResponseEntity<ApiResponse<CycleResponse>> getCycle(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long cycleId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        CycleResponse cycle = cycleService.getCycle(slug, projectId, cycleId, userId);
        return ResponseEntity.ok(ApiResponse.success("Cycle récupéré", cycle));
    }

    @PatchMapping("/{cycleId}")
    public ResponseEntity<ApiResponse<CycleResponse>> updateCycle(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long cycleId,
        @Valid @RequestBody UpdateCycleRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        CycleResponse cycle = cycleService.updateCycle(slug, projectId, cycleId, request, userId);
        return ResponseEntity.ok(ApiResponse.success("Cycle mis à jour", cycle));
    }

    @DeleteMapping("/{cycleId}")
    public ResponseEntity<ApiResponse<Void>> deleteCycle(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long cycleId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        cycleService.deleteCycle(slug, projectId, cycleId, userId);
        return ResponseEntity.ok(ApiResponse.success("Cycle supprimé", null));
    }

    // =========================================================================
    // Issues du cycle
    // =========================================================================

    @GetMapping("/{cycleId}/issues")
    public ResponseEntity<ApiResponse<List<IssueResponse>>> listCycleIssues(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long cycleId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueResponse> issues = cycleService.listCycleIssues(slug, projectId, cycleId, userId);
        return ResponseEntity.ok(ApiResponse.success("Issues du cycle récupérées", issues));
    }

    @PostMapping("/{cycleId}/issues")
    public ResponseEntity<ApiResponse<Void>> addIssueToCycle(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long cycleId,
        @Valid @RequestBody AddIssueToCycleRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        cycleService.addIssueToCycle(slug, projectId, cycleId, request, userId);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Issue ajoutée au cycle", null));
    }

    @DeleteMapping("/{cycleId}/issues/{issueId}")
    public ResponseEntity<ApiResponse<Void>> removeIssueFromCycle(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long cycleId,
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        cycleService.removeIssueFromCycle(slug, projectId, cycleId, issueId, userId);
        return ResponseEntity.ok(ApiResponse.success("Issue retirée du cycle", null));
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
