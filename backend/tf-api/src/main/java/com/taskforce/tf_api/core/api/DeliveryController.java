package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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

import com.taskforce.tf_api.core.dto.request.ApprovalDecisionRequest;
import com.taskforce.tf_api.core.dto.request.DelegateRequest;
import com.taskforce.tf_api.core.dto.request.MissionFollowUpRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryOpenApprovalResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryProviderResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.dto.response.MissionChangesResponse;
import com.taskforce.tf_api.core.dto.response.MissionFileChangeResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.delivery.DeliveryActivityService;
import com.taskforce.tf_api.core.service.delivery.MissionChangesService;
import com.taskforce.tf_api.core.service.delivery.MissionResultService;
import com.taskforce.tf_api.core.service.delivery.DeliveryRunner;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Délégation à un agent de livraison (TF-AGENT-DELIVERY). Chemin scopé workspace
 * (garde d'appartenance assurée par l'interceptor sur {@code /api/workspaces/{slug}/**}).
 *
 * <p>Slice 2 : liste des providers. Slice 3 : déléguer une issue (dispatch async via {@link DeliveryRunner})
 * et lire l'état du run. La décision d'accepter le résultat reste humaine.</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/delivery")
@RequiredArgsConstructor
public class DeliveryController {

    private static final String RUNNING = DeliveryRunStatus.RUNNING.name();
    private static final String QUEUED  = DeliveryRunStatus.QUEUED.name();

    private final DeliveryService deliveryService;
    private final DeliveryRunner deliveryRunner;
    private final DeliveryActivityService activityService;
    private final MissionResultService missionResults;
    private final MissionChangesService missionChanges;
    private final UserRepository userRepository;

    /**
     * GET /api/workspaces/{slug}/delivery/providers?projectId= : agents de la délégation, chacun prêt ou non pour la
     * personne connectée (et pour ce projet si {@code projectId} est donné), avec ce qui manque.
     */
    @GetMapping("/providers")
    public ResponseEntity<ApiResponse<List<DeliveryProviderResponse>>> listProviders(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @RequestParam(name = "projectId", required = false) Long projectId
    ) {
        return ResponseEntity.ok(ApiResponse.success("Providers retrieved",
            deliveryService.listProviders(slug, projectId, resolveUserId(jwt))));
    }

    /**
     * POST /api/workspaces/{slug}/delivery/issues/{issueId}/delegate
     * Délègue une issue à un agent. Crée le run (QUEUED) puis déclenche l'exécution APRÈS le commit
     * (évite la course @Async / lecture avant commit).
     */
    @PostMapping("/issues/{issueId}/delegate")
    public ResponseEntity<ApiResponse<DeliveryRunResponse>> delegate(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long issueId,
        @Valid @RequestBody DelegateRequest request
    ) {
        Long userId = resolveUserId(jwt);
        DeliveryRunResponse run = deliveryService.delegate(
            slug, issueId, request.getProviderKey(), request.getModel(), userId);
        deliveryRunner.execute(run.id()); // async, une fois le run committé
        return ResponseEntity.ok(ApiResponse.success("Task delegated", run));
    }

    /**
     * GET /api/workspaces/{slug}/delivery/issues/{issueId}/run — dernier run (data null si aucun).
     * Si le run est encore en cours (provider <b>asynchrone</b>), on le ré-interroge une
     * fois : le polling du front fait ainsi progresser l'état jusqu'au terminal (DONE/FAILED). Encore en
     * attente, il est relu aussi : une délégation que personne ne réclame y est close (runner local, ADR-013).
     */
    @GetMapping("/issues/{issueId}/run")
    public ResponseEntity<ApiResponse<DeliveryRunResponse>> latestRun(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long issueId
    ) {
        Long userId = resolveUserId(jwt);
        DeliveryRunResponse run = deliveryService.latestRun(slug, issueId, userId).orElse(null);
        if (run != null && (RUNNING.equals(run.status()) || QUEUED.equals(run.status()))) {
            deliveryRunner.refresh(run.id()); // transaction propre
            run = deliveryService.latestRun(slug, issueId, userId).orElse(run);
        }
        return ResponseEntity.ok(ApiResponse.success("Run retrieved", run));
    }

    /**
     * GET /api/workspaces/{slug}/delivery/runs — runs de délégation du workspace (vue « workflow »).
     * Les plus récents d'abord, bornés aux projets visibles par l'utilisateur. Les runs encore en attente
     * sont relus, comme sur la fiche d'issue : le panneau ne montre pas « en attente » une délégation close.
     */
    @GetMapping("/runs")
    public ResponseEntity<ApiResponse<List<DeliveryRunResponse>>> listRuns(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        List<DeliveryRunResponse> runs = deliveryService.listRuns(slug, userId);
        List<Long> queued = runs.stream().filter(r -> QUEUED.equals(r.status())).map(DeliveryRunResponse::id).toList();
        if (!queued.isEmpty()) {
            queued.forEach(deliveryRunner::refresh);
            runs = deliveryService.listRuns(slug, userId);
        }
        return ResponseEntity.ok(ApiResponse.success("Runs retrieved", runs));
    }

    /**
     * GET /api/workspaces/{slug}/delivery/approvals/open : ce qui attend vraiment la personne connectée (R128, séance
     * n°19), une ligne par mission : ses demandes encore ouvertes, sur une mission qui peut encore les recevoir, dans les
     * projets qu'elle voit. « Waiting for you » lit ceci, pas les notifications.
     */
    @GetMapping("/approvals/open")
    public ResponseEntity<ApiResponse<List<DeliveryOpenApprovalResponse>>> openApprovals(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        return ResponseEntity.ok(ApiResponse.success("Open requests retrieved",
            activityService.openApprovals(slug, resolveUserId(jwt))));
    }

    /**
     * GET /api/workspaces/{slug}/delivery/runs/{runId}/activity?after=N : chronologie en direct du run après
     * l'événement N, et ses demandes de validation (OSS-5.3, OSS-5.4). Lue par la fiche d'issue pendant le run.
     */
    @GetMapping("/runs/{runId}/activity")
    public ResponseEntity<ApiResponse<DeliveryRunActivityResponse>> activity(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long runId,
        @RequestParam(name = "after", defaultValue = "0") int after
    ) {
        return ResponseEntity.ok(ApiResponse.success("Run activity",
            activityService.activity(slug, runId, after, resolveUserId(jwt))));
    }

    /**
     * POST /api/workspaces/{slug}/delivery/runs/{runId}/approvals/{approvalId} : autorise ou refuse une action de
     * l'agent. Seule la personne qui a délégué répond : l'action s'exécute sur sa machine.
     */
    @PostMapping("/runs/{runId}/approvals/{approvalId}")
    public ResponseEntity<ApiResponse<Void>> decide(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long runId,
        @PathVariable Long approvalId,
        @Valid @RequestBody ApprovalDecisionRequest request
    ) {
        boolean allow = "ALLOW".equals(request.decision());
        activityService.decide(slug, runId, approvalId, allow, request.forMission(), resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success(
            allow ? (request.forMission() ? "Allowed for this mission" : "Action allowed") : "Action denied", null));
    }

    /**
     * GET /api/workspaces/{slug}/delivery/runs/{runId}/evidence?format=json|md : le dossier de preuve de la mission
     * (spécification de la v2, §9). En JSON, le fichier {@code taskforce-evidence/1} tel quel, sans enveloppe : il se
     * vérifie sans TaskForce, par recalcul des empreintes. En Markdown, le même, lisible, avec le résultat de ce recalcul.
     * 404 pour un run sans dossier (antérieur à la v2).
     */
    @GetMapping("/runs/{runId}/evidence")
    public ResponseEntity<String> evidence(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long runId,
        @RequestParam(defaultValue = "json") String format
    ) {
        boolean markdown = "md".equalsIgnoreCase(format);
        String file = activityService.dossier(slug, runId, resolveUserId(jwt), markdown)
            .orElseThrow(() -> new ResourceNotFoundException("This run has no evidence file"));
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"evidence-run-" + runId + (markdown ? ".md\"" : ".json\""))
            .contentType(markdown ? MediaType.parseMediaType("text/markdown; charset=UTF-8") : MediaType.APPLICATION_JSON)
            .body(file);
    }

    /**
     * POST /api/workspaces/{slug}/delivery/runs/{runId}/apply : « Apply » sur la carte de résultat (R78) : la pull
     * request de l'agent est fusionnée sur GitHub, puis l'issue terminée. Seule la personne qui a délégué tranche. Si
     * les tests du projet ont échoué, elle ne passe outre qu'avec une raison (R87).
     */
    @PostMapping("/runs/{runId}/apply")
    public ResponseEntity<ApiResponse<Void>> apply(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId,
        @Valid @RequestBody(required = false) MissionApplyRequest request
    ) {
        missionResults.apply(slug, runId, resolveUserId(jwt), request == null ? null : request.reason());
        return ResponseEntity.ok(ApiResponse.success("Applied: the pull request is merged", null));
    }

    /** Pourquoi appliquer malgré des tests en échec ; demandé seulement dans ce cas, posté sur l'issue. */
    public record MissionApplyRequest(@Size(max = 2000) String reason) {}

    /**
     * POST .../runs/{runId}/done : « Mark as done » : la mission n'a rien changé (ni pull request ni commit), l'issue
     * se termine et son activité le dit (rejeu de la 1.8.0). Seule la personne qui a délégué tranche.
     */
    @PostMapping("/runs/{runId}/done")
    public ResponseEntity<ApiResponse<Void>> markDone(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId
    ) {
        missionResults.markDone(slug, runId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Marked as done: no change was needed", null));
    }

    /** POST .../runs/{runId}/discard : « Discard » : la pull request est fermée, sa branche supprimée. */
    @PostMapping("/runs/{runId}/discard")
    public ResponseEntity<ApiResponse<Void>> discard(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId
    ) {
        missionResults.discard(slug, runId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Discarded", null));
    }

    /**
     * POST .../runs/{runId}/retry : « Try again » : le résultat est écarté, la remarque postée sur l'issue, et une
     * nouvelle mission part avec le même agent ; la réponse est cette nouvelle mission.
     */
    @PostMapping("/runs/{runId}/retry")
    public ResponseEntity<ApiResponse<DeliveryRunResponse>> retry(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId,
        @Valid @RequestBody(required = false) MissionRetryRequest request
    ) {
        String note = request == null ? null : request.note();
        DeliveryRunResponse run = missionResults.retry(slug, runId, resolveUserId(jwt), note);
        deliveryRunner.execute(run.id()); // async, une fois le run committé, comme une délégation
        return ResponseEntity.ok(ApiResponse.success("Delegated again", run));
    }

    /** La remarque de la personne pour la nouvelle mission ; elle va sur l'issue, où l'agent la lit. */
    public record MissionRetryRequest(@Size(max = 2000) String note) {}

    /**
     * POST .../runs/{runId}/follow-up : « Ask for changes » (R139) : les commentaires sur les lignes, envoyés ensemble,
     * relancent l'agent sur la même branche ; la réponse est cette nouvelle mission.
     */
    @PostMapping("/runs/{runId}/follow-up")
    public ResponseEntity<ApiResponse<DeliveryRunResponse>> followUp(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId,
        @Valid @RequestBody MissionFollowUpRequest request
    ) {
        DeliveryRunResponse run = missionResults.askForChanges(slug, runId, resolveUserId(jwt), request.comments());
        deliveryRunner.execute(run.id()); // async, une fois le run committé, comme une délégation
        return ResponseEntity.ok(ApiResponse.success("The agent is on it", run));
    }

    /**
     * GET .../runs/{runId}/changes : les fichiers que la mission a changés, chacun avec ses lignes ajoutées et retirées,
     * pendant le travail et après (R139), et ce que la personne connectée peut en faire maintenant.
     */
    @GetMapping("/runs/{runId}/changes")
    public ResponseEntity<ApiResponse<MissionChangesResponse>> changes(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId
    ) {
        return ResponseEntity.ok(ApiResponse.success("Mission changes", missionChanges.changes(slug, runId, resolveUserId(jwt))));
    }

    /** GET .../runs/{runId}/changes/file?path= : le diff d'un fichier de la mission, ou son contenu dans un dossier jetable. */
    @GetMapping("/runs/{runId}/changes/file")
    public ResponseEntity<ApiResponse<MissionFileChangeResponse>> changedFile(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId, @RequestParam String path
    ) {
        return ResponseEntity.ok(ApiResponse.success("File change", missionChanges.file(slug, runId, path, resolveUserId(jwt))));
    }

    /**
     * POST .../runs/{runId}/changes/revert : remet un fichier comme avant la mission, sur sa branche (R139). Le runner le
     * fait sous les règles de la mission ; la liste des fichiers dit quand c'est fait.
     */
    @PostMapping("/runs/{runId}/changes/revert")
    public ResponseEntity<ApiResponse<Void>> revertFile(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId,
        @Valid @RequestBody MissionRevertRequest request
    ) {
        missionChanges.revert(slug, runId, request.path(), resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Putting the file back", null));
    }

    /** Le fichier à remettre comme avant. */
    public record MissionRevertRequest(@NotBlank @Size(max = 1000) String path) {}

    /** POST .../runs/{runId}/correction : une correction tapée pendant le travail, que l'agent lit à sa prochaine étape (R140). */
    @PostMapping("/runs/{runId}/correction")
    public ResponseEntity<ApiResponse<Void>> correct(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId,
        @Valid @RequestBody MissionCorrectionRequest request
    ) {
        missionChanges.correct(slug, runId, request.text(), resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Sent to the agent", null));
    }

    /** Ce que la personne veut dire à l'agent pendant qu'il travaille. */
    public record MissionCorrectionRequest(@NotBlank @Size(max = 2000) String text) {}

    /**
     * POST .../runs/{runId}/stop : « Stop » pendant le travail (R138) : la mission se clôt au nom de la personne qui l'a
     * déléguée, et le runner arrête l'agent à son prochain signe de vie. Ce n'est pas une panne : l'issue reste où elle est.
     */
    @PostMapping("/runs/{runId}/stop")
    public ResponseEntity<ApiResponse<Void>> stop(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @PathVariable Long runId
    ) {
        missionResults.stop(slug, runId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Stopped", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
