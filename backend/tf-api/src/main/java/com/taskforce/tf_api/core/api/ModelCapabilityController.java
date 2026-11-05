package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.agent.ModelCapabilityService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Ce que sait faire chaque modèle (R113) : la table de l'instance, une mesure cas par cas, et le modèle que la personne
 * prend pour Cortex dans la webapp. Le service vérifie l'espace ; tout membre lit, mesure et choisit pour lui-même.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/ai/models")
@RequiredArgsConstructor
public class ModelCapabilityController {

    private final ModelCapabilityService capabilities;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<ModelCapabilityResponse>> modelCapabilities(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(capabilities.table(slug, resolveUserId(jwt))));
    }

    /** Ouvre une mesure d'un modèle servi ; ses cas se rejouent ensuite un par un. */
    @PostMapping("/runs")
    public ResponseEntity<ApiResponse<ModelCapabilityResponse.RunStarted>> startModelMeasure(
        @PathVariable String slug, @Valid @RequestBody ModelRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(capabilities.start(slug, resolveUserId(jwt), body.model())));
    }

    /** Rejoue et note un cas : un cas par requête, pour qu'aucune ne tienne plusieurs réponses du modèle. */
    @PostMapping("/runs/{runId}/cases/{caseKey}")
    public ResponseEntity<ApiResponse<ModelCapabilityResponse.CaseResult>> measureModelCase(
        @PathVariable String slug, @PathVariable Long runId, @PathVariable String caseKey, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(capabilities.measure(slug, resolveUserId(jwt), runId, caseKey)));
    }

    /** Le modèle de Cortex pour la personne ; un modèle vide la ramène à celui de l'instance. */
    @PutMapping("/choice")
    public ResponseEntity<ApiResponse<ModelCapabilityResponse>> chooseCortexModel(
        @PathVariable String slug, @Valid @RequestBody ModelRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(capabilities.choose(slug, resolveUserId(jwt), body.model())));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }

    public record ModelRequest(@Size(max = 128) String model) {
    }
}
