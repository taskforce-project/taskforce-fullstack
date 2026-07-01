package com.taskforce.tf_api.core.api;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.ApplyRedistributionRequest;
import com.taskforce.tf_api.core.dto.response.ApplyRedistributionResponse;
import com.taskforce.tf_api.core.dto.response.RedistributionPlanResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.RedistributionService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Redistribution de charge (PROD-1.12) — niveau workspace, réservée aux managers (OWNER/ADMIN).
 *
 * <ul>
 *   <li>{@code POST /preview} → plan proposé (déplacements motivés, charge avant/après), aucune écriture.</li>
 *   <li>{@code POST /apply}   → applique les déplacements validés par le manager.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/redistribute")
@RequiredArgsConstructor
public class RedistributionController {

    private final RedistributionService redistributionService;
    private final JwtIdentityResolver identityResolver;
    private final UserRepository userRepository;

    @PostMapping("/preview")
    public ResponseEntity<ApiResponse<RedistributionPlanResponse>> preview(
        @PathVariable String slug,
        @RequestParam(name = "userId", required = false) Long targetUserId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        RedistributionPlanResponse plan = redistributionService.preview(slug, userId, targetUserId);
        return ResponseEntity.ok(ApiResponse.success("Plan de redistribution calculé", plan));
    }

    @PostMapping("/apply")
    public ResponseEntity<ApiResponse<ApplyRedistributionResponse>> apply(
        @PathVariable String slug,
        @Valid @RequestBody ApplyRedistributionRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        ApplyRedistributionResponse result = redistributionService.apply(slug, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Redistribution appliquée", result));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
