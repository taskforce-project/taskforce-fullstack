package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.DecisionBrief;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.agent.DecisionService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import lombok.RequiredArgsConstructor;

/**
 * Aide à la décision par projet (boucle OODA — Phase C).
 * {@code POST /api/workspaces/{slug}/projects/{projectId}/decision}
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/projects/{projectId}")
@RequiredArgsConstructor
public class DecisionController {

    private final DecisionService     decisionService;
    private final UserRepository      userRepository;
    private final JwtIdentityResolver identityResolver;

    @PostMapping("/decision")
    public ResponseEntity<ApiResponse<DecisionBrief>> decide(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @RequestParam(name = "deep", defaultValue = "false") boolean deep,
        @AuthenticationPrincipal Jwt jwt
    ) {
        DecisionBrief brief = decisionService.decide(slug, projectId, resolveUserId(jwt), deep);
        return ResponseEntity.ok(ApiResponse.success("Décision générée", brief));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
