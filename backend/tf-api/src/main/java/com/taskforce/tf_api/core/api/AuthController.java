package com.taskforce.tf_api.core.api;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RefreshTokenRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.ResendOtpRequest;
import com.taskforce.tf_api.core.dto.request.SelectPlanRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.request.ForgotPasswordRequest;
import com.taskforce.tf_api.core.dto.request.ResetPasswordRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.SelectPlanResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.service.AuthService;
import com.taskforce.tf_api.shared.security.HumanChallengeService;
import com.taskforce.tf_api.shared.security.TurnstileService;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

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
    private final HumanChallengeService humanChallengeService;
    private final TurnstileService turnstileService;

    @Value("${security.turnstile.site-key:}")
    private String turnstileSiteKey;

    /**
     * Défi de vérification humaine, demandé au chargement du formulaire d'inscription.
     * GET /api/auth/challenge
     *
     * <p>Renvoie toujours 200. Si un mécanisme est désactivé, le client le voit dans la réponse et
     * n'affiche pas ce qui n'a pas lieu d'être — plutôt que de deviner à partir d'une variable
     * d'environnement dupliquée côté client, qui dériverait de la configuration serveur.</p>
     */
    @GetMapping("/challenge")
    public ResponseEntity<ApiResponse<Map<String, Object>>> challenge() {
        Map<String, Object> payload = Map.of(
            "token", humanChallengeService.issue(),
            "required", humanChallengeService.isEnabled(),
            // La clé de SITE est publique par nature : elle est destinée au navigateur. La servir
            // depuis l'API évite d'avoir à la répliquer dans la configuration du frontend, où elle
            // pourrait diverger de celle que le serveur utilise réellement pour vérifier.
            "turnstileSiteKey", turnstileSiteKey == null ? "" : turnstileSiteKey,
            "turnstileRequired", turnstileService.isEnabled()
        );
        return ResponseEntity.ok(ApiResponse.success("Défi émis", payload));
    }

    /**
     * Inscription d'un nouvel utilisateur (Étape 1/3)
     * Crée le compte dans Keycloak et envoie l'OTP
     * POST /api/auth/register
     */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<RegisterResponse>> register(
        @Valid @RequestBody RegisterRequest request,
        HttpServletRequest httpRequest
    ) {
        log.info("Requête d'inscription reçue pour : {}", request.getEmail());

        // Turnstile est vérifié ICI, et non dans AuthService, pour deux raisons. D'abord l'adresse de
        // l'appelant n'existe qu'au niveau de la requête HTTP, et elle améliore le jugement rendu par
        // Cloudflare. Ensuite c'est une préoccupation de bordure — comme la signature du webhook
        // Stripe, vérifiée dans son contrôleur : on rejette au plus tôt, avant d'entrer dans le
        // domaine. Le défi signé, lui, reste dans AuthService, où il garde l'inscription elle-même.
        String refusTurnstile = turnstileService.verify(
            request.getTurnstileToken(), clientIp(httpRequest));
        if (refusTurnstile != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(refusTurnstile));
        }

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
     * Sélection du plan (Étape 2/3)
     * Enregistre le plan choisi et renvoie l'OTP
     * POST /api/auth/select-plan
     */
    @PostMapping("/select-plan")
    public ResponseEntity<ApiResponse<SelectPlanResponse>> selectPlan(
        @Valid @RequestBody SelectPlanRequest request
    ) {
        log.info("Requête de sélection de plan reçue pour : {}", request.getEmail());

        try {
            SelectPlanResponse response = authService.selectPlan(request);

            return ResponseEntity.ok(
                ApiResponse.success("Plan sélectionné avec succès", response)
            );

        } catch (Exception e) {
            log.error("Erreur lors de la sélection du plan : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Vérification du code OTP et finalisation de l'inscription (Étape 3/3)
     * Vérifie l'OTP et crée l'utilisateur en DB avec le plan choisi
     * POST /api/auth/verify-otp
     */
    @PostMapping("/verify-otp")
    public ResponseEntity<ApiResponse<VerifyOtpResponse>> verifyOtp(
        @Valid @RequestBody VerifyOtpRequest request
    ) {
        log.info("Requête de vérification OTP reçue pour : {}", request.getEmail());

        try {
            VerifyOtpResponse response = authService.verifyOtpAndCompleteRegistration(request);

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
     * Demande de réinitialisation de mot de passe
     * POST /api/auth/forgot-password
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(
        @Valid @RequestBody ForgotPasswordRequest request
    ) {
        log.info("Requête de réinitialisation de mot de passe pour : {}", request.getEmail());

        try {
            authService.forgotPassword(request.getEmail());

            return ResponseEntity.ok(
                ApiResponse.<Void>success("Un code de vérification a été envoyé à votre adresse email", null)
            );

        } catch (Exception e) {
            log.error("Erreur lors de la demande de réinitialisation : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Réinitialisation du mot de passe avec code OTP
     * POST /api/auth/reset-password
     */
    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
        @Valid @RequestBody ResetPasswordRequest request
    ) {
        log.info("Requête de réinitialisation de mot de passe pour : {}", request.getEmail());

        try {
            authService.resetPassword(request.getEmail(), request.getOtpCode(), request.getNewPassword());

            return ResponseEntity.ok(
                ApiResponse.<Void>success("Mot de passe réinitialisé avec succès", null)
            );

        } catch (Exception e) {
            log.error("Erreur lors de la réinitialisation du mot de passe : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
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
            AuthResponse response = authService.refreshToken(request.getRefreshToken());

            return ResponseEntity.ok(
                ApiResponse.success("Token rafraîchi avec succès", response)
            );

        } catch (Exception e) {
            log.error("Erreur lors du rafraîchissement du token : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Déconnexion (révoque tous les refresh tokens de l'utilisateur)
     * POST /api/auth/logout
     */
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
        @RequestHeader("Authorization") String authorization
    ) {
        log.info("Requête de déconnexion");

        try {
            String token = authorization.startsWith("Bearer ") ? authorization.substring(7) : authorization;
            authService.logout(token);

            return ResponseEntity.ok(
                ApiResponse.<Void>success("Déconnexion réussie", null)
            );

        } catch (Exception e) {
            log.error("Erreur lors de la déconnexion : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * Adresse de l'appelant, transmise à Turnstile pour affiner son jugement.
     *
     * <p>Derrière nginx, {@code getRemoteAddr()} renvoie l'adresse du proxy et non celle du visiteur :
     * on lit donc {@code X-Forwarded-For} en priorité, en ne gardant que le <b>premier</b> élément —
     * les suivants sont les proxys traversés. Cet en-tête est falsifiable par le client, mais
     * l'enjeu ici est la qualité d'un signal anti-robot, pas une décision d'autorisation : au pire
     * Turnstile juge sur une adresse erronée, et le refus reste fondé sur le jeton.</p>
     */
    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
