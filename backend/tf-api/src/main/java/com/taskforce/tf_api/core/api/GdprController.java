package com.taskforce.tf_api.core.api;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.GdprService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Droits des personnes RGPD (CERT-C11.3) — scopé à l'utilisateur authentifié.
 */
@RestController
@RequestMapping("/api/gdpr")
@RequiredArgsConstructor
public class GdprController {

    private final GdprService gdprService;
    private final UserRepository userRepository;

    /** Export de mes données personnelles (portabilité). */
    @GetMapping("/export")
    public ResponseEntity<ApiResponse<Map<String, Object>>> exportMyData(@AuthenticationPrincipal Jwt jwt) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Données exportées", gdprService.exportMyData(userId)));
    }

    /** Droit à l'effacement - étape 1 : PLANIFIE la suppression (délai de grâce), récupérable jusqu'à la purge. */
    @DeleteMapping("/account")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteMyAccount(@AuthenticationPrincipal Jwt jwt) {
        Long userId = resolveUserId(jwt);
        java.time.LocalDateTime purgeAt = gdprService.deleteMyAccount(userId);
        return ResponseEntity.ok(ApiResponse.success("Suppression planifiée",
            Map.of("scheduledPurgeAt", purgeAt)));
    }

    /** Annule une suppression planifiée (récupération pendant le délai de grâce). */
    @PostMapping("/account/restore")
    public ResponseEntity<ApiResponse<Void>> restoreMyAccount(@AuthenticationPrincipal Jwt jwt) {
        gdprService.restoreMyAccount(resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Compte restauré", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
