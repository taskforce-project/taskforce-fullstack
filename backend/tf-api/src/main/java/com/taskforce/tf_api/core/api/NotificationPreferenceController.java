package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.response.NotificationPreferenceResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.NotificationPreferenceService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Réglages de notification de l'utilisateur courant (portée compte, groupe « Personal »).
 * Route : /api/me/notification-preferences
 */
@RestController
@RequestMapping("/api/me/notification-preferences")
@RequiredArgsConstructor
public class NotificationPreferenceController {

    private final NotificationPreferenceService preferenceService;
    private final UserRepository userRepository;

    /**
     * GET /api/me/notification-preferences
     * Matrice complète des réglages (défauts fusionnés avec l'enregistré).
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificationPreferenceResponse>>> get(
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Préférences de notification", preferenceService.getPreferences(userId)));
    }

    /**
     * PUT /api/me/notification-preferences
     * Upsert des réglages fournis ; renvoie la matrice recalculée.
     */
    @PutMapping
    public ResponseEntity<ApiResponse<List<NotificationPreferenceResponse>>> update(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody UpdateNotificationPreferencesRequest request
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Préférences mises à jour", preferenceService.updatePreferences(userId, request)));
    }

    // -------------------------------------------------------------------------

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
