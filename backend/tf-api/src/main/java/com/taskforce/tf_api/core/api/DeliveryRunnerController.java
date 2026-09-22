package com.taskforce.tf_api.core.api;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.RunnerResultRequest;
import com.taskforce.tf_api.core.dto.response.RunnerClaimResponse;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerService;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentityResolver;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Endpoints <b>machine</b> du runner local de délégation (ADR-013). Modèle « pull » : le backend ne peut
 * pas joindre le poste de l'utilisateur, c'est donc le runner qui vient chercher le travail, signale
 * qu'il est vivant, puis rend son résultat.
 *
 * <p>Authentifiés par un jeton de compte de service Keycloak ({@link RunnerIdentityResolver}), jamais par
 * un jeton d'utilisateur : un membre connecté qui appelle ces routes reçoit 403. Hors workspace dans le
 * chemin, car c'est le run réclamé qui porte le périmètre.</p>
 */
@RestController
@RequestMapping("/api/delivery/runner")
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@RequiredArgsConstructor
public class DeliveryRunnerController {

    private final LocalRunnerService localRunnerService;
    private final RunnerIdentityResolver identityResolver;

    /** POST /api/delivery/runner/claim : réclame le plus ancien run en attente (data null s'il n'y en a pas). */
    @PostMapping("/claim")
    public ResponseEntity<ApiResponse<RunnerClaimResponse>> claim(@AuthenticationPrincipal Jwt jwt) {
        RunnerClaimResponse claim = localRunnerService.claim(identityResolver.resolve(jwt)).orElse(null);
        return ResponseEntity.ok(ApiResponse.success(claim != null ? "Run réclamé" : "Aucun run en attente", claim));
    }

    /** POST /api/delivery/runner/runs/{runId}/heartbeat : signe de vie pendant l'exécution. */
    @PostMapping("/runs/{runId}/heartbeat")
    public ResponseEntity<ApiResponse<Void>> heartbeat(@AuthenticationPrincipal Jwt jwt, @PathVariable Long runId) {
        localRunnerService.heartbeat(runId, identityResolver.resolve(jwt));
        return ResponseEntity.ok(ApiResponse.success("Signe de vie reçu", null));
    }

    /** POST /api/delivery/runner/runs/{runId}/result : résultat final (DONE + résumé + lien, ou FAILED). */
    @PostMapping("/runs/{runId}/result")
    public ResponseEntity<ApiResponse<Void>> result(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable Long runId,
        @Valid @RequestBody RunnerResultRequest request
    ) {
        localRunnerService.complete(runId, identityResolver.resolve(jwt), request);
        return ResponseEntity.ok(ApiResponse.success("Résultat enregistré", null));
    }
}
