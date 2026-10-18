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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest;
import com.taskforce.tf_api.core.dto.request.AttachProjectTeamRequest;
import com.taskforce.tf_api.core.dto.request.CreateLabelRequest;
import com.taskforce.tf_api.core.dto.request.UpdateLabelRequest;
import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.request.ProjectRepoLinkRequest;
import com.taskforce.tf_api.core.dto.request.UpdateProjectRequest;
import com.taskforce.tf_api.core.dto.response.ProjectActivitySeriesResponse;
import com.taskforce.tf_api.core.dto.response.ProjectHealthPointResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectRepoResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.dto.response.ProjectTeamResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectRepoService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Controller REST pour les opérations sur les projets.
 * Toutes les routes sont scopées par workspace slug :
 * /api/workspaces/{slug}/projects/*
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/projects")
@RequiredArgsConstructor
@Slf4j
public class ProjectController {

    private final ProjectService     projectService;
    private final ProjectRepoService projectRepoService;
    private final UserRepository     userRepository;

    // -------------------------------------------------------------------------
    // Projets CRUD
    // -------------------------------------------------------------------------

    /**
     * GET /api/workspaces/{slug}/projects
     * Liste tous les projets du workspace.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<ProjectResponse>>> listProjects(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug
    ) {
        Long userId = resolveUserId(jwt);
        List<ProjectResponse> projects = projectService.listProjects(slug, userId);
        return ResponseEntity.ok(ApiResponse.success("Projects retrieved", projects));
    }

    /**
     * POST /api/workspaces/{slug}/projects
     * Crée un nouveau projet dans le workspace.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<ProjectResponse>> createProject(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @Valid @RequestBody CreateProjectRequest request
    ) {
        Long userId = resolveUserId(jwt);
        ProjectResponse project = projectService.createProject(slug, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Project created", project));
    }

    /**
     * PUT /api/workspaces/{slug}/projects/{id}/repo
     * Lie un dépôt de code au projet (mode CREATE = nouveau dépôt GitHub, LINK = dépôt existant).
     * Utilisable à la création (le front enchaîne) ou plus tard. Écriture (LEAD/ADMIN/OWNER).
     */
    @PutMapping("/{id}/repo")
    public ResponseEntity<ApiResponse<ProjectRepoResponse>> linkRepo(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @Valid @RequestBody ProjectRepoLinkRequest request
    ) {
        Long userId = resolveUserId(jwt);
        ProjectRepoResponse repo = projectRepoService.linkRepo(slug, id, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Repository linked to the project", repo));
    }

    /** DELETE /api/workspaces/{slug}/projects/{id}/repo — délie le dépôt du projet. */
    @DeleteMapping("/{id}/repo")
    public ResponseEntity<ApiResponse<ProjectRepoResponse>> unlinkRepo(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        ProjectRepoResponse repo = projectRepoService.unlinkRepo(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Repository unlinked", repo));
    }

    /**
     * GET /api/workspaces/{slug}/projects/{id}
     * Retourne un projet par son id.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProjectResponse>> getProject(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        ProjectResponse project = projectService.getProject(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Project retrieved", project));
    }

    /**
     * GET /api/workspaces/{slug}/projects/health-history?days=30
     * Nombre de projets à risque / critiques par jour — alimente la courbe du KPI « At risk ».
     *
     * <p>Chemin littéral déclaré AVANT {@code /{id}} : sans cela, « health-history » serait tenté
     * comme identifiant de projet.</p>
     */
    @GetMapping("/health-history")
    public ResponseEntity<ApiResponse<List<ProjectHealthPointResponse>>> getHealthHistory(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @RequestParam(name = "days", defaultValue = "30") int days
    ) {
        Long userId = resolveUserId(jwt);
        List<ProjectHealthPointResponse> history = projectService.getHealthHistory(slug, userId, days);
        return ResponseEntity.ok(ApiResponse.success("Health history retrieved", history));
    }

    /**
     * GET /api/workspaces/{slug}/projects/activity?days=14
     * Activité de TOUS les projets visibles, en un appel — sparklines de la page Operations.
     *
     * <p>Chemin littéral déclaré avant {@code /{id}}, comme {@code /health-history}.</p>
     */
    @GetMapping("/activity")
    public ResponseEntity<ApiResponse<List<ProjectActivitySeriesResponse>>> getWorkspaceActivity(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @RequestParam(name = "days", defaultValue = "14") int days
    ) {
        Long userId = resolveUserId(jwt);
        List<ProjectActivitySeriesResponse> series = projectService.getWorkspaceActivity(slug, userId, days);
        return ResponseEntity.ok(ApiResponse.success("Operations activity retrieved", series));
    }

    /**
     * PATCH /api/workspaces/{slug}/projects/{id}
     * Met à jour un projet (patch partiel).
     */
    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<ProjectResponse>> updateProject(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @Valid @RequestBody UpdateProjectRequest request
    ) {
        Long userId = resolveUserId(jwt);
        ProjectResponse project = projectService.updateProject(slug, id, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Project updated", project));
    }

    /**
     * POST /api/workspaces/{slug}/projects/{id}/archive
     * Archive un projet.
     */
    @PostMapping("/{id}/archive")
    public ResponseEntity<ApiResponse<ProjectResponse>> archiveProject(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        ProjectResponse project = projectService.archiveProject(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Project archived", project));
    }

    /**
     * POST /api/workspaces/{slug}/projects/{id}/favorite
     * Ajoute le projet aux favoris de l'utilisateur courant.
     */
    @PostMapping("/{id}/favorite")
    public ResponseEntity<ApiResponse<ProjectResponse>> favoriteProject(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        ProjectResponse project = projectService.favoriteProject(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Project added to favorites", project));
    }

    /**
     * DELETE /api/workspaces/{slug}/projects/{id}/favorite
     * Retire le projet des favoris de l'utilisateur courant.
     */
    @DeleteMapping("/{id}/favorite")
    public ResponseEntity<ApiResponse<ProjectResponse>> unfavoriteProject(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        ProjectResponse project = projectService.unfavoriteProject(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Project removed from favorites", project));
    }

    /**
     * DELETE /api/workspaces/{slug}/projects/{id}
     * Supprime définitivement un projet.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteProject(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        projectService.deleteProject(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Project deleted", null));
    }

    // -------------------------------------------------------------------------
    // Membres
    // -------------------------------------------------------------------------

    /**
     * GET /api/workspaces/{slug}/projects/{id}/members
     */
    @GetMapping("/{id}/members")
    public ResponseEntity<ApiResponse<List<ProjectMemberResponse>>> listMembers(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        List<ProjectMemberResponse> members = projectService.listMembers(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Members retrieved", members));
    }

    /**
     * POST /api/workspaces/{slug}/projects/{id}/members
     */
    @PostMapping("/{id}/members")
    public ResponseEntity<ApiResponse<ProjectMemberResponse>> addMember(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @Valid @RequestBody AddProjectMemberRequest request
    ) {
        Long userId = resolveUserId(jwt);
        ProjectMemberResponse member = projectService.addMember(slug, id, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Member added", member));
    }

    /**
     * DELETE /api/workspaces/{slug}/projects/{id}/members/{memberId}
     */
    @DeleteMapping("/{id}/members/{memberId}")
    public ResponseEntity<ApiResponse<Void>> removeMember(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @PathVariable Long memberId
    ) {
        Long userId = resolveUserId(jwt);
        projectService.removeMember(slug, id, userId, memberId);
        return ResponseEntity.ok(ApiResponse.success("Member removed", null));
    }

    // -------------------------------------------------------------------------
    // Équipes associées (PROD-3.6b)
    // -------------------------------------------------------------------------

    /** GET /api/workspaces/{slug}/projects/{id}/teams */
    @GetMapping("/{id}/teams")
    public ResponseEntity<ApiResponse<List<ProjectTeamResponse>>> listProjectTeams(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Project teams", projectService.listProjectTeams(slug, id, userId)));
    }

    /** POST /api/workspaces/{slug}/projects/{id}/teams */
    @PostMapping("/{id}/teams")
    public ResponseEntity<ApiResponse<ProjectTeamResponse>> attachTeam(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @Valid @RequestBody AttachProjectTeamRequest request
    ) {
        Long userId = resolveUserId(jwt);
        ProjectTeamResponse team = projectService.attachTeam(slug, id, request.getTeamId(), userId);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Team attached", team));
    }

    /** DELETE /api/workspaces/{slug}/projects/{id}/teams/{teamId} */
    @DeleteMapping("/{id}/teams/{teamId}")
    public ResponseEntity<ApiResponse<Void>> detachTeam(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @PathVariable Long teamId
    ) {
        Long userId = resolveUserId(jwt);
        projectService.detachTeam(slug, id, teamId, userId);
        return ResponseEntity.ok(ApiResponse.success("Team detached", null));
    }

    // -------------------------------------------------------------------------
    // Labels
    // -------------------------------------------------------------------------

    /**
     * GET /api/workspaces/{slug}/projects/{id}/labels
     */
    @GetMapping("/{id}/labels")
    public ResponseEntity<ApiResponse<List<ProjectLabelResponse>>> listLabels(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id
    ) {
        Long userId = resolveUserId(jwt);
        List<ProjectLabelResponse> labels = projectService.listLabels(slug, id, userId);
        return ResponseEntity.ok(ApiResponse.success("Labels retrieved", labels));
    }

    /**
     * POST /api/workspaces/{slug}/projects/{id}/labels
     */
    @PostMapping("/{id}/labels")
    public ResponseEntity<ApiResponse<ProjectLabelResponse>> createLabel(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @Valid @RequestBody CreateLabelRequest request
    ) {
        Long userId = resolveUserId(jwt);
        ProjectLabelResponse label = projectService.createLabel(slug, id, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Label created", label));
    }

    /**
     * PUT /api/workspaces/{slug}/projects/{id}/labels/{labelId}
     */
    @PutMapping("/{id}/labels/{labelId}")
    public ResponseEntity<ApiResponse<ProjectLabelResponse>> updateLabel(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @PathVariable Long labelId,
        @Valid @RequestBody UpdateLabelRequest request
    ) {
        Long userId = resolveUserId(jwt);
        ProjectLabelResponse label = projectService.updateLabel(slug, id, labelId, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Label updated", label));
    }

    /**
     * DELETE /api/workspaces/{slug}/projects/{id}/labels/{labelId}
     */
    @DeleteMapping("/{id}/labels/{labelId}")
    public ResponseEntity<ApiResponse<Void>> deleteLabel(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @PathVariable Long id,
        @PathVariable Long labelId
    ) {
        Long userId = resolveUserId(jwt);
        projectService.deleteLabel(slug, id, labelId, userId);
        return ResponseEntity.ok(ApiResponse.success("Label deleted", null));
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
