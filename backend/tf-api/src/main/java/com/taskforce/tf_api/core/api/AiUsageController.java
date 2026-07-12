package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.AiUsageResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Consommation IA du workspace (mois courant + plafond du plan).
 * GET /api/workspaces/{slug}/ai/usage
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/ai")
@RequiredArgsConstructor
public class AiUsageController {

    private final AiUsageService aiUsageService;
    private final UserRepository userRepository;

    @GetMapping("/usage")
    public ResponseEntity<ApiResponse<AiUsageResponse>> usage(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return ResponseEntity.ok(ApiResponse.success(aiUsageService.getUsage(slug, user.getId())));
    }
}
