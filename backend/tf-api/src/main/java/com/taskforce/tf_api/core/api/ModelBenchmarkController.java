package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.agent.ModelBenchmarkService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Le banc des modèles (R131) : la matrice de l'espace, un passage cas par cas, le détail d'un modèle où une note se retourne, et
 * l'essai à l'aveugle sur une issue. Le service vérifie l'espace ; tout membre lit, passe et juge, comme pour la mesure des
 * capacités. Un essai à l'aveugle n'appartient qu'à la personne qui l'a lancé.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/ai/benchmark")
@RequiredArgsConstructor
public class ModelBenchmarkController {

    private final ModelBenchmarkService benchmark;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse>> benchmarkMatrix(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.matrix(slug, resolveUserId(jwt))));
    }

    /** Par tâche et par cas : les réponses, les temps, les critères ; et les essais à l'aveugle de la personne. */
    @GetMapping("/detail")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.ModelDetail>> benchmarkModelDetail(
        @PathVariable String slug, @RequestParam @Size(max = 128) String model, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.detail(slug, resolveUserId(jwt), model)));
    }

    /** Ouvre un passage d'un modèle servi ; ses cas se jouent ensuite un par un. */
    @PostMapping("/runs")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.RunStarted>> startBenchmarkRun(
        @PathVariable String slug, @Valid @RequestBody ModelRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.start(slug, resolveUserId(jwt), body.model())));
    }

    /**
     * Charge le modèle d'un passage avant que rien ne soit chronométré (R142) : un démarrage à froid ne compte pas contre lui.
     * Un modèle qui ne se charge pas est un résultat, pas une erreur.
     */
    @PostMapping("/runs/{runId}/load")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.LoadResult>> loadBenchmarkModel(
        @PathVariable String slug, @PathVariable Long runId, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.load(slug, resolveUserId(jwt), runId)));
    }

    /** Joue et note un cas : un cas par requête, pour qu'aucune ne tienne plusieurs réponses du modèle. */
    @PostMapping("/runs/{runId}/cases/{caseKey}")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.CaseDetail>> playBenchmarkCase(
        @PathVariable String slug, @PathVariable Long runId, @PathVariable String caseKey, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.play(slug, resolveUserId(jwt), runId, caseKey)));
    }

    /** « Stop » : coupe l'appel au modèle en cours de la personne, pour qu'elle n'attende pas la fin d'un cas. */
    @PostMapping("/stop")
    public ResponseEntity<ApiResponse<Void>> stopBenchmark(@PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        benchmark.stop(slug, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** Les passages de l'espace, le plus récent d'abord : ce qui remplit « History » avant toute banque de tests (R142). */
    @GetMapping("/history")
    public ResponseEntity<ApiResponse<List<ModelBenchmarkResponse.RunLine>>> benchmarkHistory(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.history(slug, resolveUserId(jwt))));
    }

    /** Retourne la note d'un cas : réussi, raté, ou {@code null} pour la rendre au code. */
    @PutMapping("/results/{resultId}/verdict")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.ModelDetail>> overturnBenchmarkCase(
        @PathVariable String slug, @PathVariable Long resultId, @RequestBody VerdictRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.overturn(slug, resolveUserId(jwt), resultId, body.passed())));
    }

    /** Ouvre un essai sur une issue que la personne lit : un modèle, nommé ; ou deux ou trois, à l'aveugle, tirés sous des lettres. */
    @PostMapping("/trials")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.TrialStarted>> startBlindTrial(
        @PathVariable String slug, @Valid @RequestBody TrialRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(
            benchmark.startTrial(slug, resolveUserId(jwt), body.projectId(), body.issueId(), body.task(), body.models())));
    }

    /** Fait répondre le modèle d'une lettre, sans outil ; rien ne s'écrit sur l'issue. */
    @PostMapping("/trials/{trialId}/letters/{letter}")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.TrialLetterAnswer>> playBlindTrialLetter(
        @PathVariable String slug, @PathVariable Long trialId, @PathVariable String letter, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.playTrial(slug, resolveUserId(jwt), trialId, letter)));
    }

    /** Le choix de la personne, une fois : une lettre, ou aucune ; les noms apparaissent. */
    @PostMapping("/trials/{trialId}/choice")
    public ResponseEntity<ApiResponse<ModelBenchmarkResponse.TrialResult>> chooseBlindTrial(
        @PathVariable String slug, @PathVariable Long trialId, @Valid @RequestBody ChoiceRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(benchmark.chooseTrial(slug, resolveUserId(jwt), trialId, body.letter())));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }

    public record ModelRequest(@NotBlank @Size(max = 128) String model) {
    }

    /** {@code passed} : la note de la personne ; {@code null} la rend au code. */
    public record VerdictRequest(Boolean passed) {
    }

    public record TrialRequest(@NotNull Long projectId, @NotNull Long issueId, @NotBlank @Size(max = 32) String task,
                               @NotEmpty @Size(min = 1, max = 3) List<@NotBlank @Size(max = 128) String> models) {
    }

    /** {@code letter} : la lettre choisie ; {@code null} : aucune. */
    public record ChoiceRequest(@Size(max = 1) String letter) {
    }
}
