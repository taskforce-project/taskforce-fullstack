package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.EvalBankResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.agent.EvalCriteria;
import com.taskforce.tf_api.core.service.agent.EvalService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * La banque d'évaluations de Cortex (R61, séance n°10) : un cas tiré d'une réponse, ses critères figés,
 * un rejeu par modèle et sa note. Le service vérifie l'espace, puis le rôle pour l'interrupteur.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/evals")
@RequiredArgsConstructor
public class EvalController {

    private final EvalService evalService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<EvalBankResponse>> bank(@PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(evalService.bank(slug, resolveUserId(jwt))));
    }

    /** Le brouillon d'un cas, tiré du dossier d'une réponse : les critères proposés viennent de ce que la personne a validé. */
    @PostMapping("/cases/draft")
    public ResponseEntity<ApiResponse<EvalBankResponse.Draft>> draft(
        @PathVariable String slug, @Valid @RequestBody DraftRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(evalService.draft(slug, resolveUserId(jwt), body.record())));
    }

    @PostMapping("/cases")
    public ResponseEntity<ApiResponse<EvalBankResponse.CaseSummary>> create(
        @PathVariable String slug, @Valid @RequestBody CaseRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(
            evalService.create(slug, resolveUserId(jwt), body.record(), body.title(), body.criteria())));
    }

    @DeleteMapping("/cases/{caseId}")
    public ResponseEntity<ApiResponse<Void>> archive(
        @PathVariable String slug, @PathVariable Long caseId, @AuthenticationPrincipal Jwt jwt) {
        evalService.archive(slug, resolveUserId(jwt), caseId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/runs")
    public ResponseEntity<ApiResponse<EvalBankResponse.RunSummary>> startRun(
        @PathVariable String slug, @Valid @RequestBody RunRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(evalService.startRun(slug, resolveUserId(jwt), body.model())));
    }

    /** Rejoue un cas dans un rejeu : un cas par requête, pour qu'aucune ne tienne plusieurs réponses du modèle. */
    @PostMapping("/runs/{runId}/cases/{caseId}")
    public ResponseEntity<ApiResponse<EvalBankResponse.Result>> runCase(
        @PathVariable String slug, @PathVariable Long runId, @PathVariable Long caseId, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(evalService.runCase(slug, resolveUserId(jwt), runId, caseId)));
    }

    @GetMapping("/runs/{runId}")
    public ResponseEntity<ApiResponse<EvalBankResponse.RunDetail>> run(
        @PathVariable String slug, @PathVariable Long runId, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(evalService.run(slug, resolveUserId(jwt), runId)));
    }

    @PutMapping("/settings")
    public ResponseEntity<ApiResponse<Boolean>> settings(
        @PathVariable String slug, @Valid @RequestBody SettingsRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(evalService.setEnabled(slug, resolveUserId(jwt), body.enabled())));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }

    // -------------------------------------------------------------------------
    // DTOs internes
    // -------------------------------------------------------------------------

    public record DraftRequest(@NotBlank @Size(max = 64) String record) {
    }

    public record CaseRequest(@NotBlank @Size(max = 64) String record, @Size(max = 200) String title,
                              @NotNull EvalCriteria criteria) {
    }

    public record RunRequest(@Size(max = 128) String model) {
    }

    public record SettingsRequest(@NotNull Boolean enabled) {
    }
}
