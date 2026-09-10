package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.ConnectKeyRequest;
import com.taskforce.tf_api.core.dto.request.DelegateRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryKeyStatus;
import com.taskforce.tf_api.core.dto.response.DeliveryProviderResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
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
        return ResponseEntity.ok(ApiResponse.success("Providers récupérés", providers));
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
        return ResponseEntity.ok(ApiResponse.success("Tâche déléguée", run));
    }

    /**
     * GET /api/workspaces/{slug}/delivery/issues/{issueId}/run — dernier run (data null si aucun).
     * Si le run est encore en cours (provider <b>asynchrone</b> type Cursor), on le ré-interroge une
     * fois : le polling du front fait ainsi progresser l'état jusqu'au terminal (DONE/FAILED).
     */
    @GetMapping("/issues/{issueId}/run")
    public ResponseEntity<ApiResponse<DeliveryRunResponse>> latestRun(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long issueId
    ) {
        Long userId = resolveUserId(jwt);
        DeliveryRunResponse run = deliveryService.latestRun(slug, issueId, userId).orElse(null);
        if (run != null && "RUNNING".equals(run.status())) {
            deliveryRunner.refresh(run.id()); // avance les runs asynchrones (transaction propre)
            run = deliveryService.latestRun(slug, issueId, userId).orElse(run);
        }
        return ResponseEntity.ok(ApiResponse.success("Run récupéré", run));
    }

    // =========================================================================
    // Clés API de délégation du workspace (Anthropic B1, Cursor... - chiffrées)
    // =========================================================================

    /** GET …/delivery/anthropic — état de la clé Anthropic (jamais renvoyée en clair). */
    @GetMapping("/anthropic")
    public ResponseEntity<ApiResponse<DeliveryKeyStatus>> anthropicStatus(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug
    ) {
        DeliveryKeyStatus status = deliveryService.keyStatus(slug, resolveUserId(jwt), IntegrationProvider.ANTHROPIC);
        return ResponseEntity.ok(ApiResponse.success("Statut Anthropic récupéré", status));
    }

    /** POST …/delivery/anthropic — connecte/remplace la clé API Anthropic (OWNER/ADMIN). */
    @PostMapping("/anthropic")
    public ResponseEntity<ApiResponse<DeliveryKeyStatus>> connectAnthropic(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @Valid @RequestBody ConnectKeyRequest request
    ) {
        DeliveryKeyStatus status = deliveryService.connectKey(
            slug, resolveUserId(jwt), IntegrationProvider.ANTHROPIC, request.apiKey());
        return ResponseEntity.ok(ApiResponse.success("Clé Anthropic connectée", status));
    }

    /** DELETE …/delivery/anthropic — déconnecte la clé API Anthropic (OWNER/ADMIN). */
    @DeleteMapping("/anthropic")
    public ResponseEntity<ApiResponse<Void>> disconnectAnthropic(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug
    ) {
        deliveryService.disconnectKey(slug, resolveUserId(jwt), IntegrationProvider.ANTHROPIC);
        return ResponseEntity.ok(ApiResponse.success("Clé Anthropic déconnectée", null));
    }

    /** GET …/delivery/cursor — état de la clé Cursor (jamais renvoyée en clair). */
    @GetMapping("/cursor")
    public ResponseEntity<ApiResponse<DeliveryKeyStatus>> cursorStatus(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug
    ) {
        DeliveryKeyStatus status = deliveryService.keyStatus(slug, resolveUserId(jwt), IntegrationProvider.CURSOR);
        return ResponseEntity.ok(ApiResponse.success("Statut Cursor récupéré", status));
    }

    /** POST …/delivery/cursor — connecte/remplace la clé API Cursor (OWNER/ADMIN). */
    @PostMapping("/cursor")
    public ResponseEntity<ApiResponse<DeliveryKeyStatus>> connectCursor(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug, @Valid @RequestBody ConnectKeyRequest request
    ) {
        DeliveryKeyStatus status = deliveryService.connectKey(
            slug, resolveUserId(jwt), IntegrationProvider.CURSOR, request.apiKey());
        return ResponseEntity.ok(ApiResponse.success("Clé Cursor connectée", status));
    }

    /** DELETE …/delivery/cursor — déconnecte la clé API Cursor (OWNER/ADMIN). */
    @DeleteMapping("/cursor")
    public ResponseEntity<ApiResponse<Void>> disconnectCursor(
        @AuthenticationPrincipal Jwt jwt, @PathVariable String slug
    ) {
        deliveryService.disconnectKey(slug, resolveUserId(jwt), IntegrationProvider.CURSOR);
        return ResponseEntity.ok(ApiResponse.success("Clé Cursor déconnectée", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
