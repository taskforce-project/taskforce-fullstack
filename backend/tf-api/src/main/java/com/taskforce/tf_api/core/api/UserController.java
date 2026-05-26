package com.taskforce.tf_api.core.api;

import com.taskforce.tf_api.core.dto.request.UpdateUserRequest;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.service.UserService;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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

    /**
     * Retourne le profil complet de l'utilisateur authentifié.
     * GET /api/users/me
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getMe(
        @AuthenticationPrincipal Jwt jwt
    ) {
        String email = jwt.getClaim("sub");
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
        String email = jwt.getClaim("sub");
        log.debug("PATCH /api/users/me — email={}", email);
        UserResponse response = userService.updateUserByEmail(email, request);
        return ResponseEntity.ok(ApiResponse.success("Profil mis à jour", response));
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
        String email = jwt.getClaim("sub");
        log.debug("POST /api/users/me/avatar — email={}", email);
        UserResponse response = userService.uploadAvatar(email, file);
        return ResponseEntity.ok(ApiResponse.success("Avatar mis à jour", response));
    }
}
