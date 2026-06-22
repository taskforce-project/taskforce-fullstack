package com.taskforce.tf_api.core.api;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
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

    /** Droit à l'effacement : anonymise mon compte et révoque l'accès. */
    @DeleteMapping("/account")
    public ResponseEntity<ApiResponse<Void>> deleteMyAccount(@AuthenticationPrincipal Jwt jwt) {
        Long userId = resolveUserId(jwt);
        gdprService.deleteMyAccount(userId);
        return ResponseEntity.ok(ApiResponse.success("Compte anonymisé", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
