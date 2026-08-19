package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.ProfileResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProfileService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour les données de la page profil de l'utilisateur courant.
 * Routes scopées par workspace : /api/workspaces/{slug}/profile
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/profile")
@RequiredArgsConstructor
@Slf4j
public class ProfileController {

    private final ProfileService  profileService;
    private final UserRepository  userRepository;

    /**
     * GET /api/workspaces/{slug}/profile
     * Retourne stats, feed d'activité et données heatmap de l'utilisateur courant.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<ProfileResponse>> getProfile(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        ProfileResponse profile = profileService.getProfile(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Profil récupéré", profile));
    }

    // -------------------------------------------------------------------------

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
