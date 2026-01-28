package com.taskforce.tf_api.core.api;

import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RefreshTokenRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.ResendOtpRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.service.AuthService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Controller REST pour l'authentification
 * Tous les appels à Keycloak et Stripe passent par l'API Java
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthService authService;

    /**
     * Inscription d'un nouvel utilisateur
     * POST /api/auth/register
     */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<RegisterResponse>> register(
        @Valid @RequestBody RegisterRequest request
    ) {
        log.info("Requête d'inscription reçue pour : {}", request.getEmail());

        try {
            RegisterResponse response = authService.register(request);

            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Inscription réussie. Veuillez vérifier votre email.", response));

        } catch (Exception e) {
            log.error("Erreur lors de l'inscription : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Vérification du code OTP et finalisation de l'inscription
     * POST /api/auth/verify-otp
     */
    @PostMapping("/verify-otp")
    public ResponseEntity<ApiResponse<VerifyOtpResponse>> verifyOtp(
        @Valid @RequestBody VerifyOtpRequest request,
        @RequestParam(defaultValue = "FREE") String planType
    ) {
        log.info("Requête de vérification OTP reçue pour : {}", request.getEmail());

        try {
            VerifyOtpResponse response = authService.verifyOtpAndCompleteRegistration(request, planType);

            return ResponseEntity.ok(
                ApiResponse.success("Email vérifié avec succès", response)
            );

        } catch (Exception e) {
            log.error("Erreur lors de la vérification OTP : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Renvoi du code OTP
     * POST /api/auth/resend-otp
     */
    @PostMapping("/resend-otp")
    public ResponseEntity<ApiResponse<RegisterResponse>> resendOtp(
        @Valid @RequestBody ResendOtpRequest request
    ) {
        log.info("Requête de renvoi OTP pour : {}", request.getEmail());

        try {
            RegisterResponse response = authService.resendOtp(request.getEmail());

            return ResponseEntity.ok(
                ApiResponse.success("Code de vérification renvoyé", response)
            );

        } catch (Exception e) {
            log.error("Erreur lors du renvoi OTP : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Connexion
     * POST /api/auth/login
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
        @Valid @RequestBody LoginRequest request
    ) {
        log.info("Requête de connexion reçue pour : {}", request.getEmail());

        try {
            AuthResponse response = authService.login(request);

            return ResponseEntity.ok(
                ApiResponse.success("Connexion réussie", response)
            );

        } catch (Exception e) {
            log.error("Erreur lors de la connexion : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Rafraîchissement du token d'accès
     * POST /api/auth/refresh-token
     */
    @PostMapping("/refresh-token")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(
        @Valid @RequestBody RefreshTokenRequest request
    ) {
        log.info("Requête de rafraîchissement de token");

        try {
            // TODO: Implémenter le rafraîchissement du token
            throw new UnsupportedOperationException("Fonctionnalité en cours d'implémentation");

        } catch (Exception e) {
            log.error("Erreur lors du rafraîchissement du token : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Déconnexion (révoque le refresh token)
     * POST /api/auth/logout
     */
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
        @RequestHeader("Authorization") String authorization
    ) {
        log.info("Requête de déconnexion");

        try {
            // TODO: Extraire le userId du token et révoquer les refresh tokens
            return ResponseEntity.ok(
                ApiResponse.<Void>success("Déconnexion réussie", null)
            );

        } catch (Exception e) {
            log.error("Erreur lors de la déconnexion : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }
}
