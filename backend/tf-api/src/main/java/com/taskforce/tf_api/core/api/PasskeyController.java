package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
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

import com.taskforce.tf_api.core.dto.request.PasskeyRegistrationRequest;
import com.taskforce.tf_api.core.dto.response.PasskeyResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.PasskeyService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/** Passkeys de la personne connectée (réglages de sécurité) : en ajouter une, les voir, en retirer une. */
@RestController
@Profile("!desktop")
@RequestMapping("/api/users/me/passkeys")
@RequiredArgsConstructor
public class PasskeyController {

    private final PasskeyService passkeys;
    private final UserRepository userRepository;
    private final JwtIdentityResolver identityResolver;

    /** POST /api/users/me/passkeys/options : options de création, à passer à {@code navigator.credentials.create}. */
    @PostMapping("/options")
    public ResponseEntity<ApiResponse<Map<String, Object>>> options(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success("Passkey options", passkeys.registrationOptions(resolveUserId(jwt))));
    }

    /** POST /api/users/me/passkeys : enregistre la passkey créée par le navigateur. */
    @PostMapping
    public ResponseEntity<ApiResponse<PasskeyResponse>> register(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody PasskeyRegistrationRequest request
    ) {
        PasskeyResponse passkey = passkeys.register(resolveUserId(jwt), request.label(), request.credential());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Passkey added", passkey));
    }

    /** GET /api/users/me/passkeys : passkeys du compte, sans leur clé. */
    @GetMapping
    public ResponseEntity<ApiResponse<List<PasskeyResponse>>> list(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success("Passkeys retrieved", passkeys.list(resolveUserId(jwt))));
    }

    /** DELETE /api/users/me/passkeys/{passkeyId} : retire cette passkey du compte. */
    @DeleteMapping("/{passkeyId}")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String passkeyId) {
        passkeys.delete(resolveUserId(jwt), passkeyId);
        return ResponseEntity.ok(ApiResponse.success("Passkey removed", null));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        return userRepository.findByEmail(email).map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
