package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.AiInsightResponse;
import com.taskforce.tf_api.core.dto.response.AnalyticsKpisResponse;
import com.taskforce.tf_api.core.dto.response.BurndownPointResponse;
import com.taskforce.tf_api.core.dto.response.MemberCapacityResponse;
import com.taskforce.tf_api.core.dto.response.ThroughputPointResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/workspaces/{slug}/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final UserRepository   userRepository;

    @GetMapping("/kpis")
    public ResponseEntity<ApiResponse<AnalyticsKpisResponse>> getKpis(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "KPIs récupérés",
            analyticsService.getKpis(slug, userId)
        ));
    }

    @GetMapping("/throughput")
    public ResponseEntity<ApiResponse<List<ThroughputPointResponse>>> getThroughput(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Throughput récupéré",
            analyticsService.getThroughput(slug, userId)
        ));
    }

    @GetMapping("/burndown")
    public ResponseEntity<ApiResponse<List<BurndownPointResponse>>> getBurndown(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Burndown récupéré",
            analyticsService.getBurndown(slug, userId)
        ));
    }

    @GetMapping("/capacity")
    public ResponseEntity<ApiResponse<List<MemberCapacityResponse>>> getCapacity(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        // userId unused for capacity but kept for consistency / future auth checks
        resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Capacité récupérée",
            analyticsService.getCapacity(slug)
        ));
    }

    @GetMapping("/insights")
    public ResponseEntity<ApiResponse<List<AiInsightResponse>>> getInsights(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Insights générés",
            analyticsService.generateInsights(slug)
        ));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
