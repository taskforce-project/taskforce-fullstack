package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.AddTeamMemberRequest;
import com.taskforce.tf_api.core.dto.request.CreateTeamRequest;
import com.taskforce.tf_api.core.dto.request.UpdateTeamRequest;
import com.taskforce.tf_api.core.dto.response.TeamMemberResponse;
import com.taskforce.tf_api.core.dto.response.TeamResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.TeamService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/workspaces/{slug}/teams")
@RequiredArgsConstructor
public class TeamController {

    private final TeamService    teamService;
    private final UserRepository userRepository;

    // =========================================================================
    // Teams CRUD
    // =========================================================================

    @GetMapping
    public ResponseEntity<ApiResponse<List<TeamResponse>>> listTeams(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        List<TeamResponse> teams = teamService.listTeams(slug);
        return ResponseEntity.ok(ApiResponse.success("Équipes récupérées", teams));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<TeamResponse>> createTeam(
        @PathVariable String slug,
        @Valid @RequestBody CreateTeamRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        TeamResponse team = teamService.createTeam(slug, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Équipe créée", team));
    }

    @GetMapping("/{teamId}")
    public ResponseEntity<ApiResponse<TeamResponse>> getTeam(
        @PathVariable String slug,
        @PathVariable Long teamId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        TeamResponse team = teamService.getTeam(slug, teamId);
        return ResponseEntity.ok(ApiResponse.success("Équipe récupérée", team));
    }

    @PatchMapping("/{teamId}")
    public ResponseEntity<ApiResponse<TeamResponse>> updateTeam(
        @PathVariable String slug,
        @PathVariable Long teamId,
        @Valid @RequestBody UpdateTeamRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        TeamResponse team = teamService.updateTeam(slug, teamId, request);
        return ResponseEntity.ok(ApiResponse.success("Équipe mise à jour", team));
    }

    @DeleteMapping("/{teamId}")
    public ResponseEntity<ApiResponse<Void>> deleteTeam(
        @PathVariable String slug,
        @PathVariable Long teamId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        teamService.deleteTeam(slug, teamId);
        return ResponseEntity.ok(ApiResponse.success("Équipe supprimée", null));
    }

    // =========================================================================
    // Members
    // =========================================================================

    @GetMapping("/{teamId}/members")
    public ResponseEntity<ApiResponse<List<TeamMemberResponse>>> listMembers(
        @PathVariable String slug,
        @PathVariable Long teamId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        List<TeamMemberResponse> members = teamService.listMembers(slug, teamId);
        return ResponseEntity.ok(ApiResponse.success("Membres récupérés", members));
    }

    @PostMapping("/{teamId}/members")
    public ResponseEntity<ApiResponse<TeamMemberResponse>> addMember(
        @PathVariable String slug,
        @PathVariable Long teamId,
        @Valid @RequestBody AddTeamMemberRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        TeamMemberResponse member = teamService.addMember(slug, teamId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Membre ajouté", member));
    }

    @DeleteMapping("/{teamId}/members/{userId}")
    public ResponseEntity<ApiResponse<Void>> removeMember(
        @PathVariable String slug,
        @PathVariable Long teamId,
        @PathVariable Long userId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        teamService.removeMember(slug, teamId, userId);
        return ResponseEntity.ok(ApiResponse.success("Membre retiré", null));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Long resolveUserId(Jwt jwt) {
        String keycloakId = jwt.getSubject();
        User user = userRepository.findByKeycloakId(keycloakId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
