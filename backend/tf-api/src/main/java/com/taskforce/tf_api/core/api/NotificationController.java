package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.NotificationResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.NotificationService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour les notifications de l'inbox.
 * Routes scopées par workspace : /api/workspaces/{slug}/notifications
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/notifications")
@RequiredArgsConstructor
@Slf4j
public class NotificationController {

    private final NotificationService notificationService;
    private final UserRepository      userRepository;

    /**
     * GET /api/workspaces/{slug}/notifications
     * Liste les notifications non acquittées du workspace courant.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificationResponse>>> listNotifications(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        List<NotificationResponse> notifications = notificationService.listNotifications(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Notifications récupérées", notifications));
    }

    /**
     * GET /api/workspaces/{slug}/notifications/unread-count
     * Retourne le nombre de notifications non lues.
     */
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Long>> countUnread(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        long count = notificationService.countUnread(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Compteur non-lus", count));
    }

    /**
     * PATCH /api/workspaces/{slug}/notifications/{id}/read
     * Marque une notification comme lue.
     */
    @PatchMapping("/{id}/read")
    public ResponseEntity<ApiResponse<NotificationResponse>> markAsRead(
        @PathVariable String slug,
        @PathVariable Long id,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        NotificationResponse response = notificationService.markAsRead(id, userId);
        return ResponseEntity.ok(ApiResponse.success("Notification marquée comme lue", response));
    }

    /**
     * PATCH /api/workspaces/{slug}/notifications/read-all
     * Marque toutes les notifications comme lues.
     */
    @PatchMapping("/read-all")
    public ResponseEntity<ApiResponse<Void>> markAllAsRead(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        notificationService.markAllAsRead(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Toutes les notifications marquées comme lues", null));
    }

    /**
     * PATCH /api/workspaces/{slug}/notifications/acknowledge-all
     * Acquitte (dismiss) toutes les notifications.
     */
    @PatchMapping("/acknowledge-all")
    public ResponseEntity<ApiResponse<Void>> acknowledgeAll(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        notificationService.acknowledgeAll(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Toutes les notifications acquittées", null));
    }

    // -------------------------------------------------------------------------

    private Long resolveUserId(Jwt jwt) {
        String keycloakId = jwt.getSubject();
        User user = userRepository.findByKeycloakId(keycloakId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
