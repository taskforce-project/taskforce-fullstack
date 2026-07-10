package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.GenerateChartRequest;
import com.taskforce.tf_api.core.dto.response.AiInsightResponse;
import com.taskforce.tf_api.core.dto.response.AnalyticsKpisResponse;
import com.taskforce.tf_api.core.dto.response.BurndownPointResponse;
import com.taskforce.tf_api.core.dto.response.ChartSpecResponse;
import com.taskforce.tf_api.core.dto.response.MemberCapacityResponse;
import com.taskforce.tf_api.core.dto.response.ThroughputPointResponse;
import com.taskforce.tf_api.core.dto.response.WorkloadResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.core.service.agent.ChartSpecService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/workspaces/{slug}/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final ChartSpecService chartSpecService;
    private final UserRepository   userRepository;

    @GetMapping("/kpis")
    public ResponseEntity<ApiResponse<AnalyticsKpisResponse>> getKpis(
        @PathVariable String slug,
        @RequestParam(required = false) Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "KPIs récupérés",
            analyticsService.getKpis(slug, userId, projectId)
        ));
    }

    @GetMapping("/throughput")
    public ResponseEntity<ApiResponse<List<ThroughputPointResponse>>> getThroughput(
        @PathVariable String slug,
        @RequestParam(required = false) Long projectId,
        @RequestParam(required = false) String bucket,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Throughput récupéré",
            analyticsService.getThroughput(slug, userId, projectId, bucket)
        ));
    }

    @GetMapping("/burndown")
    public ResponseEntity<ApiResponse<List<BurndownPointResponse>>> getBurndown(
        @PathVariable String slug,
        @RequestParam(required = false) Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Burndown récupéré",
            analyticsService.getBurndown(slug, userId, projectId)
        ));
    }

    @GetMapping("/capacity")
    public ResponseEntity<ApiResponse<List<MemberCapacityResponse>>> getCapacity(
        @PathVariable String slug,
        @RequestParam(required = false) Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Capacité récupérée",
            analyticsService.getCapacity(slug, userId, projectId)
        ));
    }

    @GetMapping("/workload")
    public ResponseEntity<ApiResponse<WorkloadResponse>> getWorkload(
        @PathVariable String slug,
        @RequestParam(required = false) Integer days,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Charge de l'équipe récupérée",
            analyticsService.getWorkload(slug, userId, days)
        ));
    }

    @GetMapping("/insights")
    public ResponseEntity<ApiResponse<List<AiInsightResponse>>> getInsights(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Insights générés",
            analyticsService.generateInsights(slug, userId)
        ));
    }

    /** Génère un graphe à partir d'une demande en langage naturel (rendu depuis les vraies séries). */
    @PostMapping("/chart")
    public ResponseEntity<ApiResponse<ChartSpecResponse>> generateChart(
        @PathVariable String slug,
        @Valid @RequestBody GenerateChartRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Graphe généré",
            chartSpecService.generate(slug, userId, request.getPrompt(), request.getProjectId())
        ));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
