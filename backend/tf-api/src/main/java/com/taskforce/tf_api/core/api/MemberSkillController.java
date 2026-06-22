package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.UpsertMemberSkillsRequest;
import com.taskforce.tf_api.core.dto.response.MemberSkillProfileResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.MemberSkillProfileService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Profils de compétences des membres — alimente Smart Assign.
 * Routes :
 *   GET  /api/workspaces/{slug}/skills                  → tous les profils du workspace
 *   GET  /api/workspaces/{slug}/members/{userId}/skills → profil d'un membre
 *   PUT  /api/workspaces/{slug}/members/{userId}/skills → upsert (soi-même ou ADMIN/OWNER)
 */
@RestController
@RequestMapping("/api/workspaces/{slug}")
@RequiredArgsConstructor
public class MemberSkillController {

    private final MemberSkillProfileService skillService;
    private final UserRepository userRepository;

    @GetMapping("/skills")
    public ResponseEntity<ApiResponse<List<MemberSkillProfileResponse>>> listProfiles(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long requesterId = resolveUserId(jwt);
        List<MemberSkillProfileResponse> profiles = skillService.listProfiles(slug, requesterId);
        return ResponseEntity.ok(ApiResponse.success("Profils de compétences récupérés", profiles));
    }

    @GetMapping("/members/{userId}/skills")
    public ResponseEntity<ApiResponse<MemberSkillProfileResponse>> getProfile(
        @PathVariable String slug,
        @PathVariable Long userId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long requesterId = resolveUserId(jwt);
        MemberSkillProfileResponse profile = skillService.getProfile(slug, userId, requesterId);
        return ResponseEntity.ok(ApiResponse.success("Profil de compétences récupéré", profile));
    }

    @PutMapping("/members/{userId}/skills")
    public ResponseEntity<ApiResponse<MemberSkillProfileResponse>> upsertProfile(
        @PathVariable String slug,
        @PathVariable Long userId,
        @Valid @RequestBody UpsertMemberSkillsRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long requesterId = resolveUserId(jwt);
        MemberSkillProfileResponse profile = skillService.upsert(slug, userId, request, requesterId);
        return ResponseEntity.ok(ApiResponse.success("Profil de compétences mis à jour", profile));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
