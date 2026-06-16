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
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour la vue "My Work" : issues assignées à l'utilisateur
 * courant, agrégées sur l'ensemble du workspace (cross-projets).
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/my-issues")
@RequiredArgsConstructor
@Slf4j
public class MyWorkController {

    private final IssueService   issueService;
    private final UserRepository userRepository;

    /**
     * GET /api/workspaces/{slug}/my-issues
     * Toutes les issues assignées à l'utilisateur courant dans le workspace.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<IssueResponse>>> listMyIssues(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueResponse> issues = issueService.listMyIssues(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Mes issues récupérées", issues));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
