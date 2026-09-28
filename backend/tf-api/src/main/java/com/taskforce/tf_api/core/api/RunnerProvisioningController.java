package com.taskforce.tf_api.core.api;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.RunnerProvisionResponse;
import com.taskforce.tf_api.core.dto.response.RunnerStatusResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerProvisioningService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * « Connect a runner » en libre-service (ADR-013) : provisionne l'identité machine d'un runner local pour
 * l'utilisateur connecté, sans script d'admin.
 *
 * <p>Distinct des endpoints machine sous {@code /api/delivery/runner/} (réservés au runner lui-même, qui s'y
 * authentifie avec son compte de service) : ici l'appelant est une <b>personne</b> (jeton utilisateur), et le
 * runner créé est lié à SON e-mail. Le chemin est au pluriel ({@code /runners}) pour ne pas heurter le préfixe
 * machine et le filtre de session déléguée. Gaté par le même flag que le reste du runner.</p>
 */
@RestController
@RequestMapping("/api/delivery/runners")
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@RequiredArgsConstructor
public class RunnerProvisioningController {

    private final RunnerProvisioningService provisioningService;
    private final UserRepository userRepository;

    /** GET /api/delivery/runners — un runner est-il déjà provisionné pour l'utilisateur ? (sans secret) */
    @GetMapping
    public ResponseEntity<ApiResponse<RunnerStatusResponse>> status(@AuthenticationPrincipal Jwt jwt) {
        RunnerStatusResponse status = provisioningService.status(currentUser(jwt));
        return ResponseEntity.ok(ApiResponse.success("Statut du runner récupéré", status));
    }

    /** POST /api/delivery/runners — provisionne (ou régénère le secret de) le runner de l'utilisateur. */
    @PostMapping
    public ResponseEntity<ApiResponse<RunnerProvisionResponse>> provision(@AuthenticationPrincipal Jwt jwt) {
        RunnerProvisionResponse runner = provisioningService.provision(currentUser(jwt));
        return ResponseEntity.ok(ApiResponse.success("Runner provisionné", runner));
    }

    private User currentUser(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
