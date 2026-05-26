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

/**
 * Endpoints de roadmap — issues planifiées (startDate/dueDate) au niveau workspace.
 * Route : /api/workspaces/{slug}/roadmap
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/roadmap")
@RequiredArgsConstructor
public class RoadmapController {

    private final IssueService   issueService;
    private final UserRepository userRepository;

    /**
     * GET /api/workspaces/{slug}/roadmap
     * Retourne toutes les issues ayant une startDate ou une dueDate dans le workspace.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<IssueResponse>>> getScheduledIssues(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<IssueResponse> issues = issueService.getScheduledIssues(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Roadmap récupérée", issues));
    }

    private Long resolveUserId(Jwt jwt) {
        String keycloakId = jwt.getSubject();
        User user = userRepository.findByKeycloakId(keycloakId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
