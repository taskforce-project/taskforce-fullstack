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
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.DelegateRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryProviderResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProviderRegistry;
import com.taskforce.tf_api.core.service.delivery.DeliveryRunner;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
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

    private final DeliveryAgentProviderRegistry registry;
    private final DeliveryService deliveryService;
    private final DeliveryRunner deliveryRunner;
    private final UserRepository userRepository;

    /** GET /api/workspaces/{slug}/delivery/providers — providers disponibles pour la délégation. */
    @GetMapping("/providers")
    public ResponseEntity<ApiResponse<List<DeliveryProviderResponse>>> listProviders(
        @PathVariable String slug
    ) {
        List<DeliveryProviderResponse> providers = registry.all().stream()
            .map(p -> new DeliveryProviderResponse(
                p.key(), p.displayName(), p.logoKey(), p.available(), p.models()))
            .toList();
        return ResponseEntity.ok(ApiResponse.success("Providers retrieved", providers));
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

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
