package com.taskforce.tf_api.core.api;

import com.taskforce.tf_api.core.dto.request.CompleteOnboardingRequest;
import com.taskforce.tf_api.core.dto.request.DataRequestRequest;
import com.taskforce.tf_api.core.dto.request.UpdateUserRequest;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.dto.response.UserSearchResult;
import com.taskforce.tf_api.core.service.UserService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Controller REST pour les opérations sur l'utilisateur courant.
 * Tous les endpoints requièrent un token JWT valide (filtre Spring Security).
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final JwtIdentityResolver identityResolver;

    /**
     * Retourne le profil complet de l'utilisateur authentifié.
     * GET /api/users/me
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getMe(
        @AuthenticationPrincipal Jwt jwt
    ) {
        String email = identityResolver.resolveEmail(jwt);
        log.debug("GET /api/users/me — email={}", email);
        UserResponse response = userService.getByEmail(email);
        return ResponseEntity.ok(ApiResponse.success("Utilisateur récupéré", response));
    }

    /**
     * Met à jour le displayName et/ou l'avatarUrl de l'utilisateur courant.
     * PATCH /api/users/me
     */
    @PatchMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> updateMe(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody UpdateUserRequest request
    ) {
        String email = identityResolver.resolveEmail(jwt);
        log.debug("PATCH /api/users/me — email={}", email);
        UserResponse response = userService.updateUserByEmail(email, request);
        return ResponseEntity.ok(ApiResponse.success("Profil mis à jour", response));
    }

    /**
     * Clôt le parcours d'onboarding (rôle optionnel + drapeau onboarding_completed).
     * POST /api/users/me/onboarding
     */
    @PostMapping("/me/onboarding")
    public ResponseEntity<ApiResponse<UserResponse>> completeOnboarding(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody CompleteOnboardingRequest request
    ) {
        String email = identityResolver.resolveEmail(jwt);
        log.info("POST /api/users/me/onboarding — email={}", email);
        UserResponse response = userService.completeOnboarding(email, request.getJobTitle());
        return ResponseEntity.ok(ApiResponse.success("Onboarding terminé", response));
    }

    /**
     * Upload l'avatar de l'utilisateur vers Minio.
     * POST /api/users/me/avatar  (multipart/form-data, champ "file")
     */
    @PostMapping(value = "/me/avatar", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<UserResponse>> uploadAvatar(
        @RequestParam("file") MultipartFile file,
        @AuthenticationPrincipal Jwt jwt
    ) {
        String email = identityResolver.resolveEmail(jwt);
        log.debug("POST /api/users/me/avatar — email={}", email);
        UserResponse response = userService.uploadAvatar(email, file);
        return ResponseEntity.ok(ApiResponse.success("Avatar mis à jour", response));
    }

    // ---- Sécurité : mot de passe + 2FA (UI TaskForce, métier Keycloak) --------------------------

    /** Déclenche l'email « réinitialiser le mot de passe » (flux Keycloak). POST /api/users/me/password/reset */
    @PostMapping("/me/password/reset")
    public ResponseEntity<ApiResponse<Void>> requestPasswordReset(@AuthenticationPrincipal Jwt jwt) {
        userService.requestPasswordReset(identityResolver.resolveEmail(jwt));
        return ResponseEntity.ok(ApiResponse.success("Email de réinitialisation envoyé", null));
    }

    /** Statut du 2FA (TOTP). GET /api/users/me/2fa → { data: true|false } */
    @GetMapping("/me/2fa")
    public ResponseEntity<ApiResponse<Boolean>> getTwoFactor(@AuthenticationPrincipal Jwt jwt) {
        boolean enabled = userService.isTwoFactorEnabled(identityResolver.resolveEmail(jwt));
        return ResponseEntity.ok(ApiResponse.success("Statut 2FA", enabled));
    }

    /** Déclenche l'email de configuration du 2FA (TOTP). POST /api/users/me/2fa/enable */
    @PostMapping("/me/2fa/enable")
    public ResponseEntity<ApiResponse<Void>> enableTwoFactor(@AuthenticationPrincipal Jwt jwt) {
        userService.enableTwoFactor(identityResolver.resolveEmail(jwt));
        return ResponseEntity.ok(ApiResponse.success("Email de configuration 2FA envoyé", null));
    }

    /** Désactive le 2FA. DELETE /api/users/me/2fa */
    @DeleteMapping("/me/2fa")
    public ResponseEntity<ApiResponse<Void>> disableTwoFactor(@AuthenticationPrincipal Jwt jwt) {
        userService.disableTwoFactor(identityResolver.resolveEmail(jwt));
        return ResponseEntity.ok(ApiResponse.success("2FA désactivé", null));
    }

    /**
     * Recherche d'utilisateurs par email ou displayName (insensible à la casse).
     * GET /api/users/search?q=xxx  — retourne max 10 résultats.
     */
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<UserSearchResult>>> searchUsers(
        @RequestParam String q,
        @AuthenticationPrincipal Jwt jwt
    ) {
        List<UserSearchResult> results = userService.searchUsers(q);
        return ResponseEntity.ok(ApiResponse.success("Résultats de recherche", results));
    }

    /**
     * Soumet une demande RGPD (accès aux données ou suppression de compte).
     * POST /api/users/me/data-request
     */
    @PostMapping("/me/data-request")
    public ResponseEntity<ApiResponse<Void>> dataRequest(
        @Valid @RequestBody DataRequestRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        String email = identityResolver.resolveEmail(jwt);
        log.info("POST /api/users/me/data-request — email={} type={}", email, request.type());
        userService.processDataRequest(email, request.type());
        return ResponseEntity.ok(ApiResponse.success("Votre demande a été enregistrée", null));
    }
}
