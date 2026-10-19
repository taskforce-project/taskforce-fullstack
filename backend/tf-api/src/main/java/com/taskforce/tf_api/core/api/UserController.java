package com.taskforce.tf_api.core.api;

import com.taskforce.tf_api.core.dto.request.CompleteOnboardingRequest;
import com.taskforce.tf_api.core.dto.request.UpdateUserRequest;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.dto.response.UserSearchResult;
import com.taskforce.tf_api.core.service.TwoFactorService;
import com.taskforce.tf_api.core.service.UserService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
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
    private final TwoFactorService twoFactorService;

    @Value("${keycloak.public-url:${keycloak.url:http://localhost:8080}}")
    private String accountPublicUrl;

    @Value("${keycloak.realm}")
    private String accountRealm;
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
        return ResponseEntity.ok(ApiResponse.success("User retrieved", response));
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
        return ResponseEntity.ok(ApiResponse.success("Profile updated", response));
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
        return ResponseEntity.ok(ApiResponse.success("Onboarding completed", response));
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
        return ResponseEntity.ok(ApiResponse.success("Avatar updated", response));
    }

    // ---- Sécurité : la double authentification se règle sur le compte en ligne (le mot de passe se réinitialise via
    // /auth/forgot-password) ----

    /** La connexion demande-t-elle un code ? GET /api/users/me/2fa → { data: true|false } */
    @GetMapping("/me/2fa")
    public ResponseEntity<ApiResponse<Boolean>> getTwoFactor(@AuthenticationPrincipal Jwt jwt) {
        boolean enabled = twoFactorService.isOnForAccount(identityResolver.resolveEmail(jwt));
        return ResponseEntity.ok(ApiResponse.success("Two-factor authentication status", enabled));
    }

    /**
     * Page du compte en ligne, où l'on enregistre son application d'authentification (onglet « Account security »).
     * GET /api/users/me/account-page → { data: url }
     */
    @GetMapping("/me/account-page")
    public ResponseEntity<ApiResponse<String>> getAccountPage() {
        return ResponseEntity.ok(ApiResponse.success("Account page", accountPublicUrl.replaceAll("/+$", "") + "/realms/" + accountRealm + "/account"));
    }

    /**
     * Recherche d'utilisateurs par email ou displayName (insensible à la casse), parmi les personnes qui
     * partagent un workspace avec l'appelant. GET /api/users/search?q=xxx  — retourne max 10 résultats.
     */
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<UserSearchResult>>> searchUsers(
        @RequestParam String q,
        @AuthenticationPrincipal Jwt jwt
    ) {
        List<UserSearchResult> results = userService.searchUsers(q, jwt.getClaimAsString("email"));
        return ResponseEntity.ok(ApiResponse.success("Search results", results));
    }

}
