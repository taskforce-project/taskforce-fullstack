package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.delivery.MissionDossierAccess;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;

/**
 * Le lien que le témoin d'un dossier écrit dans sa pull request (R159, second tour, M-b) : {@code /verify/{id}} dans l'app,
 * où {@code id} est un identifiant du dossier, opaque et tiré au hasard. Ni l'espace ni le numéro de la mission n'y sont :
 * un dépôt privé rendu public plus tard ne publie rien d'eux. La page qu'il ouvre lit ici où mène le lien, avec les mêmes
 * contrôles d'accès que l'adresse du dossier dans son espace.
 */
@RestController
@RequestMapping("/api/evidence")
@RequiredArgsConstructor
@Validated
public class EvidenceLinkController {

    private final MissionDossierAccess dossierAccess;
    private final UserRepository userRepository;

    /**
     * GET /api/evidence/links/{id} : l'espace et la mission du dossier que désigne ce lien, pour ouvrir sa page de
     * vérification. Un lien qui ne mène à rien, ou à un dossier que la personne ne peut pas lire, répond 404, sans dire
     * lequel.
     */
    @GetMapping("/links/{id}")
    public ResponseEntity<ApiResponse<EvidenceLinkResponse>> link(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable @Pattern(regexp = "[0-9a-f]{32}", message = "id must be 32 hexadecimal digits") String id
    ) {
        Long userId = userRepository.findByEmail(jwt.getClaimAsString("email")).map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        MissionDossierAccess.Linked linked = dossierAccess.byLink(id, userId);
        return ResponseEntity.ok(ApiResponse.success("Evidence link", new EvidenceLinkResponse(linked.workspace(), linked.runId())));
    }

    /**
     * Où mène un lien du témoin.
     *
     * @param workspace l'adresse de l'espace du dossier
     * @param runId     la mission du dossier
     */
    public record EvidenceLinkResponse(String workspace, Long runId) {}
}
