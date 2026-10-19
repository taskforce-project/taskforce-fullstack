package com.taskforce.tf_api.core.api;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.PasskeySignInRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.PasskeySignInOptionsResponse;
import com.taskforce.tf_api.core.service.PasskeyService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.security.RefreshTokenCookie;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Connexion par passkey, sans mot de passe ni code : un défi, puis la réponse du navigateur contre une session (le jeton
 * de renouvellement part en cookie {@code HttpOnly}, comme la connexion par mot de passe).
 */
@RestController
@Profile("!desktop")
@RequestMapping("/api/auth/passkey")
@RequiredArgsConstructor
public class PasskeySignInController {

    private final PasskeyService passkeys;
    private final RefreshTokenCookie refreshCookie;

    /** POST /api/auth/passkey/options : défi de connexion, à passer à {@code navigator.credentials.get}. */
    @PostMapping("/options")
    public ResponseEntity<ApiResponse<PasskeySignInOptionsResponse>> options() {
        return ResponseEntity.ok(ApiResponse.success("Passkey challenge", passkeys.signInOptions()));
    }

    /** POST /api/auth/passkey/login : la réponse du navigateur contre une session. */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody PasskeySignInRequest request) {
        AuthResponse response = passkeys.signIn(request.requestId(), request.credential());
        String refresh = response.getRefreshToken();
        if (refresh == null || refresh.isBlank()) {
            return ResponseEntity.ok(ApiResponse.success("Signed in", response));
        }
        response.setRefreshToken(null);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie.set(refresh).toString())
            .body(ApiResponse.success("Signed in", response));
    }
}
