package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.MyWorkCycleResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour la vue "My Work" : issues et cycles de l'utilisateur courant, agrégés sur l'ensemble du
 * workspace (cross-projets).
 *
 * <p><b>Pourquoi des routes agrégées</b> : la vue est cross-projets. Sans elles, le client bouclait sur les projets
 * (un appel par projet) et épuisait le quota de rate limiting en quelques navigations. Ici, {@code 2} requêtes quel que
 * soit le nombre de projets. Les Pages des projets ont été retirées le 28/10/2026 (ménage de la v2).</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}")
@RequiredArgsConstructor
@Slf4j
public class MyWorkController {

    private final IssueService   issueService;
    private final CycleService   cycleService;
    private final UserRepository userRepository;

    /**
     * GET /api/workspaces/{slug}/my-issues
     * Toutes les issues assignées à l'utilisateur courant dans le workspace.
     */
    @GetMapping("/my-issues")
    public ResponseEntity<ApiResponse<List<IssueResponse>>> listMyIssues(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueResponse> issues = issueService.listMyIssues(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("My issues retrieved", issues));
    }

    /**
     * GET /api/workspaces/{slug}/my-cycles
     * Tous les cycles des projets visibles par l'utilisateur, en un appel.
     */
    @GetMapping("/my-cycles")
    public ResponseEntity<ApiResponse<List<MyWorkCycleResponse>>> listMyCycles(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        List<MyWorkCycleResponse> cycles = cycleService.listWorkspaceCycles(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("My cycles retrieved", cycles));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
