package com.taskforce.tf_api.core.api;

import java.util.List;

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

import com.taskforce.tf_api.core.dto.request.AnswerAnalysisRequest;
import com.taskforce.tf_api.core.dto.request.EditPriorityRequest;
import com.taskforce.tf_api.core.dto.request.LaunchAnalysisRequest;
import com.taskforce.tf_api.core.dto.response.AnalysisJobResponse;
import com.taskforce.tf_api.core.dto.response.StoredBriefResponse;
import com.taskforce.tf_api.core.dto.response.StoredPriorityResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.agent.AnalysisJobRunner;
import com.taskforce.tf_api.core.service.agent.AnalysisJobService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Workflows d'analyse IA (boucle OODA asynchrone) et décisions actionnables.
 *
 * <p>Le lancement et la reprise après clarification déclenchent le {@link AnalysisJobRunner}
 * <b>ici</b>, et non dans le service : la méthode de service est {@code @Transactional}, et un
 * {@code @Async} démarré avant son commit pourrait ne pas voir la ligne qu'elle vient d'écrire.
 * Au retour du service, la transaction est validée — le runner travaille sur des données visibles.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}")
@RequiredArgsConstructor
public class AnalysisController {

    private final AnalysisJobService  analysisJobService;
    private final AnalysisJobRunner   analysisJobRunner;
    private final UserRepository      userRepository;
    private final JwtIdentityResolver identityResolver;

    // ---------------------------------------------------------------------
    // Workflows
    // ---------------------------------------------------------------------

    /** Lance un workflow — retour immédiat, l'analyse se poursuit en arrière-plan. */
    @PostMapping("/analysis")
    public ResponseEntity<ApiResponse<AnalysisJobResponse>> launch(
        @PathVariable String slug,
        @Valid @RequestBody LaunchAnalysisRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        AnalysisJobResponse job = analysisJobService.launch(
            slug, request.getProjectId(), resolveUserId(jwt), request.getDepth());

        analysisJobRunner.run(job.id());
        return ResponseEntity.ok(ApiResponse.success("Analyse lancée", job));
    }

    @GetMapping("/analysis")
    public ResponseEntity<ApiResponse<List<AnalysisJobResponse>>> list(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Workflows récupérés",
            analysisJobService.list(slug, resolveUserId(jwt))));
    }

    @GetMapping("/analysis/{jobId}")
    public ResponseEntity<ApiResponse<AnalysisJobResponse>> get(
        @PathVariable String slug,
        @PathVariable Long jobId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Workflow récupéré",
            analysisJobService.get(slug, jobId, resolveUserId(jwt))));
    }

    /** Répond à la question du modèle (HITL) → le workflow reprend là où il s'était arrêté. */
    @PostMapping("/analysis/{jobId}/answer")
    public ResponseEntity<ApiResponse<AnalysisJobResponse>> answer(
        @PathVariable String slug,
        @PathVariable Long jobId,
        @Valid @RequestBody AnswerAnalysisRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        AnalysisJobResponse job = analysisJobService.answer(slug, jobId, resolveUserId(jwt), request.getAnswer());

        analysisJobRunner.run(jobId);
        return ResponseEntity.ok(ApiResponse.success("Analyse relancée", job));
    }

    /** Retire le workflow du dock (l'historique est conservé). */
    @DeleteMapping("/analysis/{jobId}")
    public ResponseEntity<ApiResponse<Void>> dismiss(
        @PathVariable String slug,
        @PathVariable Long jobId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        analysisJobService.dismiss(slug, jobId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Workflow retiré", null));
    }

    // ---------------------------------------------------------------------
    // Décision persistée + priorités actionnables
    // ---------------------------------------------------------------------

    /** Dernier brief du projet ({@code data: null} si aucune analyse n'a encore abouti). */
    @GetMapping("/projects/{projectId}/brief")
    public ResponseEntity<ApiResponse<StoredBriefResponse>> latestBrief(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Décision récupérée",
            analysisJobService.latestBrief(slug, projectId, resolveUserId(jwt))));
    }

    /** Accepte une priorité → crée l'issue correspondante dans le projet. */
    @PostMapping("/priorities/{priorityId}/accept")
    public ResponseEntity<ApiResponse<StoredPriorityResponse>> accept(
        @PathVariable String slug,
        @PathVariable Long priorityId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Issue créée",
            analysisJobService.accept(slug, priorityId, resolveUserId(jwt))));
    }

    @PostMapping("/priorities/{priorityId}/pin")
    public ResponseEntity<ApiResponse<StoredPriorityResponse>> pin(
        @PathVariable String slug,
        @PathVariable Long priorityId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Priorité épinglée",
            analysisJobService.pin(slug, priorityId, resolveUserId(jwt))));
    }

    @PostMapping("/priorities/{priorityId}/dismiss")
    public ResponseEntity<ApiResponse<StoredPriorityResponse>> dismissPriority(
        @PathVariable String slug,
        @PathVariable Long priorityId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Priorité écartée",
            analysisJobService.dismissPriority(slug, priorityId, resolveUserId(jwt))));
    }

    @PutMapping("/priorities/{priorityId}")
    public ResponseEntity<ApiResponse<StoredPriorityResponse>> edit(
        @PathVariable String slug,
        @PathVariable Long priorityId,
        @Valid @RequestBody EditPriorityRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success("Priorité mise à jour",
            analysisJobService.edit(slug, priorityId, resolveUserId(jwt), request)));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
