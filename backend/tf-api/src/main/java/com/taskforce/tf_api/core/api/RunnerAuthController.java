package com.taskforce.tf_api.core.api;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.RunnerTokenRequest;
import com.taskforce.tf_api.core.dto.response.RunnerTokenResponse;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerTokenService;
import com.taskforce.tf_api.core.service.delivery.RunnerTokenService.InvalidRunnerCredentialsException;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Jeton machine d'un runner local (ADR-013). Public comme le reste de {@code /api/auth/**} (on y échange
 * un secret contre un jeton), limité en débit comme un login.
 */
@RestController
@RequestMapping("/api/auth/runner")
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@RequiredArgsConstructor
public class RunnerAuthController {

    private final RunnerTokenService tokenService;

    /** POST /api/auth/runner/token : {@code client_credentials} relayé vers Keycloak. */
    @PostMapping("/token")
    public ResponseEntity<ApiResponse<RunnerTokenResponse>> token(@Valid @RequestBody RunnerTokenRequest request) {
        try {
            RunnerTokenResponse token = tokenService.issue(request.clientId(), request.clientSecret());
            return ResponseEntity.ok(ApiResponse.success("Jeton de runner émis", token));
        } catch (InvalidRunnerCredentialsException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error(e.getMessage()));
        }
    }
}
