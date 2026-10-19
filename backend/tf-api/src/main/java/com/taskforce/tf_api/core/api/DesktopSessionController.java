package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.context.annotation.Profile;
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

import com.taskforce.tf_api.core.dto.request.DesktopAuthorizeRequest;
import com.taskforce.tf_api.core.dto.response.DesktopAuthorizeResponse;
import com.taskforce.tf_api.core.dto.response.DesktopSessionInfoResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.DesktopSessionService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Sessions de l'app desktop de la personne connectée à la webapp : l'accord donné sur la page {@code /auth/desktop},
 * et la liste des ordinateurs connectés, que les réglages de sécurité permettent de déconnecter.
 */
@RestController
@Profile("!desktop")
@RequestMapping("/api/users/me/desktop-sessions")
@RequiredArgsConstructor
public class DesktopSessionController {

    private final DesktopSessionService sessions;
    private final UserRepository userRepository;
    private final JwtIdentityResolver identityResolver;

    /** POST /api/users/me/desktop-sessions/authorize : l'adresse de retour de l'app, avec son code d'autorisation. */
    @PostMapping("/authorize")
    public ResponseEntity<ApiResponse<DesktopAuthorizeResponse>> authorize(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody DesktopAuthorizeRequest request
    ) {
        String redirectUrl = sessions.authorize(resolveUserId(jwt), request);
        return ResponseEntity.ok(ApiResponse.success("Desktop app authorized", new DesktopAuthorizeResponse(redirectUrl)));
    }

    /** GET /api/users/me/desktop-sessions : ordinateurs connectés à l'app desktop. */
    @GetMapping
    public ResponseEntity<ApiResponse<List<DesktopSessionInfoResponse>>> list(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success("Desktop sessions retrieved", sessions.list(resolveUserId(jwt))));
    }

    /** DELETE /api/users/me/desktop-sessions/{sessionId} : déconnecte cet ordinateur. */
    @DeleteMapping("/{sessionId}")
    public ResponseEntity<ApiResponse<Void>> revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable Long sessionId) {
        sessions.revoke(resolveUserId(jwt), sessionId);
        return ResponseEntity.ok(ApiResponse.success("Desktop session ended", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        return userRepository.findByEmail(email).map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
