package com.taskforce.tf_api.core.api;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.DesktopSessionTokenRequest;
import com.taskforce.tf_api.core.dto.request.DesktopTokenRequest;
import com.taskforce.tf_api.core.dto.response.DesktopSessionResponse;
import com.taskforce.tf_api.core.service.DesktopSessionService;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Ce que l'app desktop appelle elle-même, sans session de la webapp : ouvrir sa session avec le code reçu sur
 * 127.0.0.1, relire son compte au lancement, fermer sa session. Le jeton passe dans le corps, jamais dans l'adresse.
 * L'accord, lui, se donne dans la webapp ({@link DesktopSessionController}).
 */
@RestController
@Profile("!desktop")
@RequestMapping("/api/auth/desktop")
@RequiredArgsConstructor
public class DesktopSignInController {

    private final DesktopSessionService sessions;

    /** POST /api/auth/desktop/token : code d'autorisation et vérificateur PKCE contre une session. */
    @PostMapping("/token")
    public ResponseEntity<ApiResponse<DesktopSessionResponse>> token(@Valid @RequestBody DesktopTokenRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Signed in", sessions.exchange(request)));
    }

    /** POST /api/auth/desktop/session : le compte de la session, qui se prolonge ; 401 si elle n'est plus valable. */
    @PostMapping("/session")
    public ResponseEntity<ApiResponse<DesktopSessionResponse>> session(@Valid @RequestBody DesktopSessionTokenRequest request) {
        return sessions.refresh(request.token())
            .map(session -> ResponseEntity.ok(ApiResponse.success("Session valid", session)))
            .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error("The session ended: sign in again")));
    }

    /** POST /api/auth/desktop/revoke : ferme la session (déconnexion de l'app). */
    @PostMapping("/revoke")
    public ResponseEntity<ApiResponse<Void>> revoke(@Valid @RequestBody DesktopSessionTokenRequest request) {
        sessions.revoke(request.token());
        return ResponseEntity.ok(ApiResponse.success("Signed out", null));
    }
}
