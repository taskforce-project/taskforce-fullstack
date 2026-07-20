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
import com.taskforce.tf_api.core.dto.response.MyWorkPageResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.PageService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour la vue "My Work" : issues, cycles et pages de l'utilisateur
 * courant, agrégés sur l'ensemble du workspace (cross-projets).
 *
 * <p><b>Pourquoi des routes agrégées</b> — la vue est cross-projets. Sans elles, le client devait
 * boucler sur les projets (un appel cycles + un appel pages <b>par projet</b>), soit {@code 3 + 2N}
 * requêtes à chaque affichage : le quota de rate limiting était épuisé en quelques navigations,
 * et l'application paraissait figée. Ici, {@code 3} requêtes quel que soit le nombre de projets.</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}")
@RequiredArgsConstructor
@Slf4j
public class MyWorkController {

    private final IssueService   issueService;
    private final CycleService   cycleService;
    private final PageService    pageService;
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
        return ResponseEntity.ok(ApiResponse.success("Mes issues récupérées", issues));
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
        return ResponseEntity.ok(ApiResponse.success("Mes cycles récupérés", cycles));
    }

    /**
     * GET /api/workspaces/{slug}/my-pages
     * Pages récentes des projets visibles par l'utilisateur, en un appel.
     */
    @GetMapping("/my-pages")
    public ResponseEntity<ApiResponse<List<MyWorkPageResponse>>> listMyPages(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        List<MyWorkPageResponse> pages = pageService.listWorkspacePages(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Mes pages récupérées", pages));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
