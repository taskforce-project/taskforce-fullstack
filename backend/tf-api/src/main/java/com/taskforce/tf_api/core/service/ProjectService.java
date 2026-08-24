package com.taskforce.tf_api.core.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.AddProjectMemberRequest;
import com.taskforce.tf_api.core.dto.request.CreateLabelRequest;
import com.taskforce.tf_api.core.dto.request.UpdateLabelRequest;
import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.request.UpdateProjectRequest;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectActivityPointResponse;
import com.taskforce.tf_api.core.dto.response.ProjectActivitySeriesResponse;
import com.taskforce.tf_api.core.dto.response.ProjectHealthPointResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.ProjectStatus;
import com.taskforce.tf_api.core.dto.response.ProjectTeamResponse;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectFavorite;
import com.taskforce.tf_api.core.model.ProjectLabel;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.ProjectTeam;
import com.taskforce.tf_api.core.model.Team;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectFavoriteRepository;
import com.taskforce.tf_api.core.repository.ProjectLabelRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.ProjectTeamRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.TeamMemberRepository;
import com.taskforce.tf_api.core.repository.TeamRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service de gestion des projets.
 * Toutes les opérations sont scopées par workspace.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectService {

    private final ProjectRepository        projectRepository;
    private final ProjectMemberRepository  projectMemberRepository;
    private final ProjectLabelRepository   projectLabelRepository;
    private final ProjectFavoriteRepository projectFavoriteRepository;
    private final WorkspaceRepository      workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final UserRepository           userRepository;
    private final TeamRepository           teamRepository;
    private final TeamMemberRepository     teamMemberRepository;
    private final ProjectTeamRepository    projectTeamRepository;
    private final IssueRepository          issueRepository;
    private final IssueService             issueService;
    private final ProjectVisibilityGuard   visibilityGuard;

    /**
     * Plafond « façon GitHub » : nombre max de collaborateurs sur un projet PRIVÉ en forfait Free
     * (créateur inclus). Les projets publics et les forfaits payants sont illimités.
     */
    private static final long FREE_PRIVATE_PROJECT_MEMBER_LIMIT = 5;

    // -------------------------------------------------------------------------
    // Lecture
    // -------------------------------------------------------------------------

    /**
     * Liste tous les projets d'un workspace.
     * L'utilisateur doit être membre du workspace.
     */
    @Transactional(readOnly = true)
    public List<ProjectResponse> listProjects(String workspaceSlug, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Set<Long> favoriteIds = new HashSet<>(projectFavoriteRepository.findProjectIdsByUserId(requestingUserId));
        // Visibilité projet privé : un OWNER/ADMIN voit tout ; sinon on ne montre que public + projets où il est membre.
        boolean wsAdmin = isWorkspaceAdmin(workspace.getId(), requestingUserId);
        Set<Long> memberProjectIds = wsAdmin ? Set.of()
            : new HashSet<>(projectMemberRepository.findProjectIdsByUserId(requestingUserId));
        return projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())
            .stream()
            .filter(p -> p.isPublic() || wsAdmin || memberProjectIds.contains(p.getId()))
            .map(project -> toResponse(project, favoriteIds.contains(project.getId())))
            .collect(Collectors.toList());
    }

    /**
     * Retourne un projet par son id.
     * L'utilisateur doit être membre du workspace.
     */
    @Transactional(readOnly = true)
    public ProjectResponse getProject(String workspaceSlug, Long projectId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveViewableProject(projectId, workspace, requestingUserId);
        return toResponse(project, projectFavoriteRepository.existsByUserIdAndProjectId(requestingUserId, project.getId()));
    }

    /**
     * Activité quotidienne d'un projet (QA2-32) sur les `days` derniers jours.
     * Série continue : chaque jour de la fenêtre est présent (count = 0 si rien).
     */
    @Transactional(readOnly = true)
    public List<ProjectActivityPointResponse> getProjectActivity(String workspaceSlug, Long projectId,
                                                                 Long requestingUserId, int days) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveViewableProject(projectId, workspace, requestingUserId);

        int window = Math.min(Math.max(days, 1), 90);
        java.time.LocalDate today = java.time.LocalDate.now();
        java.time.LocalDate from = today.minusDays(window - 1L);

        java.util.Map<String, Long> counts = new java.util.HashMap<>();
        for (Object[] row : issueRepository.countCreatedByDay(project.getId(), from.atStartOfDay())) {
            counts.put((String) row[0], ((Number) row[1]).longValue());
        }

        List<ProjectActivityPointResponse> series = new java.util.ArrayList<>(window);
        for (int i = 0; i < window; i++) {
            java.time.LocalDate day = from.plusDays(i);
            String key = day.toString(); // ISO 'YYYY-MM-DD'
            series.add(new ProjectActivityPointResponse(key, counts.getOrDefault(key, 0L)));
        }
        return series;
    }

    /**
     * Activité quotidienne de TOUS les projets visibles du workspace, en un seul appel.
     *
     * <p>La page Operations affiche une sparkline par projet. Interrogée projet par projet, elle
     * émettait autant de requêtes que de projets affichés — le même N+1 que celui corrigé sur
     * « Ma file ». Ici : une requête, quel que soit le nombre de projets.</p>
     */
    @Transactional(readOnly = true)
    public List<ProjectActivitySeriesResponse> getWorkspaceActivity(String workspaceSlug, Long requestingUserId, int days) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);

        int window = Math.min(Math.max(days, 1), 90);
        java.time.LocalDate today = java.time.LocalDate.now();
        java.time.LocalDate from = today.minusDays(window - 1L);

        List<Long> scopedIds = visibilityGuard.viewableProjectIds(workspace.getId(), requestingUserId);
        if (scopedIds.isEmpty()) return List.of();

        // [projectId][jour ISO] -> nombre d'issues créées
        java.util.Map<Long, java.util.Map<String, Long>> counts = new java.util.HashMap<>();
        for (Object[] row : projectRepository.findActivityByProjectIds(scopedIds, from)) {
            Long projectId = ((Number) row[0]).longValue();
            counts.computeIfAbsent(projectId, k -> new java.util.HashMap<>())
                  .put(row[1].toString(), ((Number) row[2]).longValue());
        }

        List<ProjectActivitySeriesResponse> series = new java.util.ArrayList<>(scopedIds.size());
        for (Long projectId : scopedIds) {
            java.util.Map<String, Long> byDay = counts.getOrDefault(projectId, java.util.Map.of());
            List<ProjectActivityPointResponse> points = new java.util.ArrayList<>(window);
            for (int i = 0; i < window; i++) {
                String key = from.plusDays(i).toString();
                points.add(new ProjectActivityPointResponse(key, byDay.getOrDefault(key, 0L)));
            }
            series.add(ProjectActivitySeriesResponse.builder().projectId(projectId).points(points).build());
        }
        return series;
    }

    /**
     * Historique de santé des opérations du workspace sur les {@code days} derniers jours.
     *
     * <p>Alimente la courbe placée sous le KPI « At risk ». Le périmètre est celui des projets
     * <b>ACTIFS et visibles par l'appelant</b> — mêmes règles que la page qui affiche le KPI, sinon
     * la courbe et le chiffre au-dessus raconteraient deux histoires différentes. Un projet en pause
     * ou archivé n'a pas de santé « à risque » (l'affichage le range dans « Paused »), il est donc
     * exclu ici aussi.</p>
     *
     * <p>Série continue : chaque jour de la fenêtre est présent, à zéro s'il n'y a rien à signaler —
     * l'objectif produit étant zéro, une ligne plate au plancher est l'état sain, pas un trou.</p>
     */
    @Transactional(readOnly = true)
    public List<ProjectHealthPointResponse> getHealthHistory(String workspaceSlug, Long requestingUserId, int days) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);

        int window = Math.min(Math.max(days, 1), 90);
        java.time.LocalDate today = java.time.LocalDate.now();
        java.time.LocalDate from = today.minusDays(window - 1L);

        // Visibles par l'appelant, puis restreints aux ACTIFS (cf. javadoc).
        java.util.Set<Long> activeIds = projectRepository
            .findByWorkspaceIdAndStatusOrderByCreatedAtDesc(workspace.getId(), ProjectStatus.ACTIVE)
            .stream().map(Project::getId).collect(java.util.stream.Collectors.toSet());
        List<Long> scopedIds = visibilityGuard.viewableProjectIds(workspace.getId(), requestingUserId)
            .stream().filter(activeIds::contains).toList();

        java.util.Map<String, Object[]> byDay = new java.util.HashMap<>();
        if (!scopedIds.isEmpty()) {
            for (Object[] row : projectRepository.findHealthHistory(scopedIds, from)) {
                byDay.put(row[0].toString(), row);
            }
        }

        List<ProjectHealthPointResponse> series = new java.util.ArrayList<>(window);
        for (int i = 0; i < window; i++) {
            String key = from.plusDays(i).toString(); // ISO 'YYYY-MM-DD'
            Object[] row = byDay.get(key);
            series.add(ProjectHealthPointResponse.builder()
                .date(key)
                .atRisk(row != null ? ((Number) row[1]).longValue() : 0L)
                .critical(row != null ? ((Number) row[2]).longValue() : 0L)
                .build());
        }
        return series;
    }

    // -------------------------------------------------------------------------
    // Création / Mise à jour / Suppression
    // -------------------------------------------------------------------------

    /**
     * Crée un nouveau projet dans le workspace.
     * L'auteur devient automatiquement membre LEAD.
     */
    @Transactional
    public ProjectResponse createProject(String workspaceSlug, Long requestingUserId,
                                         CreateProjectRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        User creator = resolveUser(requestingUserId);

        // Unicité de l'IDENTIFIANT (préfixe d'issue, façon Linear/Jira : DEMO-1, DEMO-2…) PAR workspace
        // — c'est LUI, pas le nom, qui doit être unique. Le NOM reste libre : deux projets « demo » dans
        // un même workspace sont permis, avec des préfixes distincts. Plutôt que d'échouer sur collision,
        // on suffixe automatiquement (comme le slug de workspace) : DEMO → DEMO2 → DEMO3.
        String identifier = uniqueIdentifier(workspace.getId(), request.getIdentifier().toUpperCase());

        Project project = Project.builder()
            .workspace(workspace)
            .name(request.getName())
            .identifier(identifier)
            .description(request.getDescription())
            .status(ProjectStatus.ACTIVE)
            .isPublic(request.isPublic())
            .iconUrl(request.getIconUrl())
            .color(request.getColor() != null ? request.getColor() : "bg-primary")
            .createdBy(creator)
            .build();

        project = projectRepository.save(project);
        log.info("Projet '{}' ({}) créé dans le workspace '{}'",
            project.getName(), project.getIdentifier(), workspaceSlug);

        // Le créateur devient LEAD automatiquement
        ProjectMember lead = ProjectMember.builder()
            .project(project)
            .user(creator)
            .role(ProjectRole.LEAD)
            .addedBy(creator)
            .build();
        projectMemberRepository.save(lead);

        // Initialiser les statuts, types et compteur d'issues par défaut
        issueService.seedDefaultStatusesAndTypes(project);

        // Seed labels par défaut
        seedDefaultLabels(project);

        return toResponse(project, false);
    }

    /**
     * Rend un identifiant de projet unique DANS le workspace en suffixant un compteur si besoin
     * (DEMO → DEMO2 → DEMO3…), sans dépasser la longueur maximale (10). Le NOM du projet reste libre :
     * seul l'identifiant (préfixe d'issue) doit être unique par workspace. Miroir de la logique de slug
     * unique des workspaces — on ne bloque plus l'utilisateur sur une collision de préfixe.
     */
    private String uniqueIdentifier(Long workspaceId, String base) {
        if (!projectRepository.existsByWorkspaceIdAndIdentifier(workspaceId, base)) {
            return base;
        }
        for (int suffix = 2; suffix < 1000; suffix++) {
            String num = String.valueOf(suffix);
            int maxBase = 10 - num.length();
            String candidate = (base.length() > maxBase ? base.substring(0, maxBase) : base) + num;
            if (!projectRepository.existsByWorkspaceIdAndIdentifier(workspaceId, candidate)) {
                return candidate;
            }
        }
        // Cas improbable (1000 préfixes identiques) : on laisse la contrainte DB trancher (→ 409).
        return base;
    }

    private void seedDefaultLabels(Project project) {
        String[][] defaults = {
            { "Bug",         "#ef4444" },
            { "Feature",     "#6366f1" },
            { "Improvement", "#f59e0b" },
            { "Documentation", "#10b981" },
            { "Question",    "#64748b" },
        };
        for (String[] entry : defaults) {
            ProjectLabel label = ProjectLabel.builder()
                .project(project)
                .name(entry[0])
                .color(entry[1])
                .build();
            projectLabelRepository.save(label);
        }
        log.info("Labels par défaut initialisés pour le projet '{}'", project.getIdentifier());
    }

    /**
     * Met à jour les informations d'un projet (patch partiel).
     * Seuls les membres LEAD du projet ou OWNER/ADMIN du workspace peuvent modifier.
     */
    @Transactional
    public ProjectResponse updateProject(String workspaceSlug, Long projectId,
                                         Long requestingUserId, UpdateProjectRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());

        assertCanManageProject(project, workspace, requestingUserId);

        if (request.getName() != null && !request.getName().isBlank()) {
            project.setName(request.getName());
        }
        if (request.getDescription() != null) {
            project.setDescription(request.getDescription());
        }
        if (request.getStatus() != null) {
            project.setStatus(request.getStatus());
        }
        if (request.getIsPublic() != null) {
            project.setPublic(request.getIsPublic());
        }
        if (request.getIconUrl() != null) {
            project.setIconUrl(request.getIconUrl());
        }
        if (request.getColor() != null && !request.getColor().isBlank()) {
            project.setColor(request.getColor());
        }
        if (request.getGrowthMode() != null) {
            project.setGrowthMode(request.getGrowthMode());
        }

        return toResponse(projectRepository.save(project),
            projectFavoriteRepository.existsByUserIdAndProjectId(requestingUserId, project.getId()));
    }

    /**
     * Archive un projet (soft-delete — statut ARCHIVED).
     * Seuls LEAD ou OWNER/ADMIN du workspace.
     */
    @Transactional
    public ProjectResponse archiveProject(String workspaceSlug, Long projectId,
                                           Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        project.setStatus(ProjectStatus.ARCHIVED);
        log.info("Projet {} archivé par l'utilisateur {}", projectId, requestingUserId);
        return toResponse(projectRepository.save(project),
            projectFavoriteRepository.existsByUserIdAndProjectId(requestingUserId, project.getId()));
    }

    /**
     * Suppression définitive d'un projet.
     * Réservé au OWNER du workspace ou au LEAD du projet.
     */
    @Transactional
    public void deleteProject(String workspaceSlug, Long projectId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        projectRepository.delete(project);
        log.info("Projet {} supprimé par l'utilisateur {}", projectId, requestingUserId);
    }

    // -------------------------------------------------------------------------
    // Favoris (scopés par utilisateur)
    // -------------------------------------------------------------------------

    /**
     * Ajoute le projet aux favoris de l'utilisateur courant (idempotent).
     */
    @Transactional
    public ProjectResponse favoriteProject(String workspaceSlug, Long projectId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());

        if (!projectFavoriteRepository.existsByUserIdAndProjectId(requestingUserId, projectId)) {
            projectFavoriteRepository.save(ProjectFavorite.builder()
                .userId(requestingUserId)
                .projectId(projectId)
                .build());
        }
        return toResponse(project, true);
    }

    /**
     * Retire le projet des favoris de l'utilisateur courant (idempotent).
     */
    @Transactional
    public ProjectResponse unfavoriteProject(String workspaceSlug, Long projectId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());

        projectFavoriteRepository.deleteByUserIdAndProjectId(requestingUserId, projectId);
        return toResponse(project, false);
    }

    // -------------------------------------------------------------------------
    // Gestion des membres
    // -------------------------------------------------------------------------

    /**
     * Liste les membres d'un projet.
     */
    @Transactional(readOnly = true)
    public List<ProjectMemberResponse> listMembers(String workspaceSlug, Long projectId,
                                                    Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        resolveViewableProject(projectId, workspace, requestingUserId);

        return projectMemberRepository.findByProjectId(projectId)
            .stream()
            .map(this::toMemberResponse)
            .collect(Collectors.toList());
    }

    /**
     * Ajoute un utilisateur au projet.
     * L'utilisateur doit déjà être membre du workspace.
     */
    @Transactional
    public ProjectMemberResponse addMember(String workspaceSlug, Long projectId,
                                            Long requestingUserId, AddProjectMemberRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        User invitee = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new ResourceNotFoundException(
                "Aucun compte trouvé pour l'email : " + request.getEmail()));

        // L'invité doit déjà être membre du workspace
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), invitee.getId())) {
            throw new BusinessException(
                "L'utilisateur doit d'abord être membre du workspace pour rejoindre ce projet");
        }

        if (projectMemberRepository.existsByProjectIdAndUserId(projectId, invitee.getId())) {
            throw new BusinessException("Cet utilisateur est déjà membre du projet");
        }

        // Plafond « façon GitHub » : projet privé + forfait Free = collaborateurs limités.
        enforcePrivateProjectSeatLimit(project);

        User requester = resolveUser(requestingUserId);
        ProjectMember member = ProjectMember.builder()
            .project(project)
            .user(invitee)
            .role(request.getRole())
            .addedBy(requester)
            .build();

        return toMemberResponse(projectMemberRepository.save(member));
    }

    // -------------------------------------------------------------------------
    // Équipes associées au projet (PROD-3.6b)
    // -------------------------------------------------------------------------

    /** Liste les équipes associées à un projet. */
    @Transactional(readOnly = true)
    public List<ProjectTeamResponse> listProjectTeams(String workspaceSlug, Long projectId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        resolveViewableProject(projectId, workspace, requestingUserId);

        return projectTeamRepository.findByProjectId(projectId).stream()
            .map(pt -> ProjectTeamResponse.from(pt.getTeam(), teamMemberRepository.countByTeamId(pt.getTeam().getId())))
            .collect(Collectors.toList());
    }

    /** Associe une équipe (du même workspace) à un projet. LEAD/ADMIN/OWNER uniquement. */
    @Transactional
    public ProjectTeamResponse attachTeam(String workspaceSlug, Long projectId, Long teamId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        Team team = teamRepository.findById(teamId)
            .orElseThrow(() -> new ResourceNotFoundException("Équipe introuvable"));
        if (!team.getWorkspace().getId().equals(workspace.getId())) {
            throw new BusinessException("Cette équipe n'appartient pas à ce workspace");
        }
        if (projectTeamRepository.existsByProjectIdAndTeamId(projectId, teamId)) {
            throw new BusinessException("Cette équipe est déjà associée au projet");
        }

        // Plafond « façon GitHub » : associer une équipe pleine à un projet privé Free ne doit pas
        // contourner la limite de collaborateurs (les membres de l'équipe comptent).
        enforcePrivateProjectSeatLimitForTeam(project, teamId);

        projectTeamRepository.save(ProjectTeam.builder().project(project).team(team).build());
        return ProjectTeamResponse.from(team, teamMemberRepository.countByTeamId(teamId));
    }

    /** Retire l'association équipe ↔ projet. LEAD/ADMIN/OWNER uniquement. */
    @Transactional
    public void detachTeam(String workspaceSlug, Long projectId, Long teamId, Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        if (!projectTeamRepository.existsByProjectIdAndTeamId(projectId, teamId)) {
            throw new ResourceNotFoundException("Cette équipe n'est pas associée au projet");
        }
        projectTeamRepository.deleteByProjectIdAndTeamId(projectId, teamId);
    }

    /**
     * Retire un membre du projet.
     * Un membre peut se retirer lui-même. Le LEAD ou OWNER/ADMIN peut retirer n'importe qui.
     */
    @Transactional
    public void removeMember(String workspaceSlug, Long projectId,
                              Long requestingUserId, Long memberId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());

        ProjectMember target = projectMemberRepository.findById(memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Membre introuvable"));

        if (!target.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("Ce membre n'appartient pas à ce projet");
        }

        boolean isSelf = target.getUser().getId().equals(requestingUserId);
        if (!isSelf) {
            assertCanManageProject(project, workspace, requestingUserId);
        }

        projectMemberRepository.delete(target);
        log.info("Membre {} retiré du projet {} par l'utilisateur {}", memberId, projectId, requestingUserId);
    }

    // -------------------------------------------------------------------------
    // Gestion des labels
    // -------------------------------------------------------------------------

    /**
     * Liste les labels d'un projet.
     */
    @Transactional(readOnly = true)
    public List<ProjectLabelResponse> listLabels(String workspaceSlug, Long projectId,
                                                  Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        resolveViewableProject(projectId, workspace, requestingUserId);

        return projectLabelRepository.findByProjectIdOrderByNameAsc(projectId)
            .stream()
            .map(this::toLabelResponse)
            .collect(Collectors.toList());
    }

    /**
     * Crée un nouveau label sur un projet.
     */
    @Transactional
    public ProjectLabelResponse createLabel(String workspaceSlug, Long projectId,
                                             Long requestingUserId, CreateLabelRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        if (projectLabelRepository.existsByProjectIdAndName(projectId, request.getName())) {
            throw new BusinessException("Un label avec ce nom existe déjà dans ce projet");
        }

        ProjectLabel label = ProjectLabel.builder()
            .project(project)
            .name(request.getName())
            .color(request.getColor() != null ? request.getColor() : "#6366f1")
            .description(request.getDescription())
            .build();

        return toLabelResponse(projectLabelRepository.save(label));
    }

    /**
     * Modifie un label existant (nom, couleur, description).
     */
    @Transactional
    public ProjectLabelResponse updateLabel(String workspaceSlug, Long projectId, Long labelId,
                                             Long requestingUserId, UpdateLabelRequest request) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        ProjectLabel label = projectLabelRepository.findById(labelId)
            .orElseThrow(() -> new ResourceNotFoundException("Label introuvable"));

        if (!label.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("Ce label n'appartient pas à ce projet");
        }
        if (request.getName() != null && !request.getName().equals(label.getName())) {
            if (projectLabelRepository.existsByProjectIdAndName(projectId, request.getName())) {
                throw new BusinessException("Un label avec ce nom existe déjà dans ce projet");
            }
            label.setName(request.getName());
        }
        if (request.getColor() != null) {
            label.setColor(request.getColor());
        }
        if (request.getDescription() != null) {
            label.setDescription(request.getDescription());
        }
        return toLabelResponse(projectLabelRepository.save(label));
    }

    /**
     * Supprime un label d'un projet.
     */
    @Transactional
    public void deleteLabel(String workspaceSlug, Long projectId, Long labelId,
                             Long requestingUserId) {
        Workspace workspace = resolveWorkspaceAndAssertMember(workspaceSlug, requestingUserId);
        Project project = resolveProject(projectId, workspace.getId());
        assertCanManageProject(project, workspace, requestingUserId);

        ProjectLabel label = projectLabelRepository.findById(labelId)
            .orElseThrow(() -> new ResourceNotFoundException("Label introuvable"));

        if (!label.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("Ce label n'appartient pas à ce projet");
        }

        projectLabelRepository.delete(label);
    }

    // -------------------------------------------------------------------------
    // Helpers internes
    // -------------------------------------------------------------------------

    private Workspace resolveWorkspaceAndAssertMember(String slug, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable : " + slug));

        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), userId)) {
            throw new BusinessException("Vous n'êtes pas membre de ce workspace");
        }

        return workspace;
    }

    private Project resolveProject(Long projectId, Long workspaceId) {
        return projectRepository.findByIdAndWorkspaceId(projectId, workspaceId)
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
    }

    /** Résout un projet ET vérifie que l'utilisateur a le droit de le VOIR (visibilité projet privé). */
    private Project resolveViewableProject(Long projectId, Workspace workspace, Long userId) {
        Project project = resolveProject(projectId, workspace.getId());
        assertCanViewProject(project, userId);
        return project;
    }

    /**
     * Visibilité « façon GitHub » : un projet est visible s'il est <b>public</b>, OU si l'utilisateur
     * en est <b>membre</b> ({@link ProjectMember}), OU s'il est <b>OWNER/ADMIN</b> du workspace.
     * Sinon → 404 (on ne révèle pas l'existence d'un projet privé).
     * <p>NB : ne gate que les lectures de {@code ProjectService} ; les vues agrégées d'issues
     * (My Queue, recherche, analytics) restent à durcir (roadmap {@code TF-PROJECT-VISIBILITY}).</p>
     */
    private void assertCanViewProject(Project project, Long userId) {
        visibilityGuard.assertCanView(project, userId);
    }

    /** Vrai si l'utilisateur est OWNER ou ADMIN du workspace (voit tous les projets, même privés). */
    private boolean isWorkspaceAdmin(Long workspaceId, Long userId) {
        return visibilityGuard.isWorkspaceAdmin(workspaceId, userId);
    }

    private User resolveUser(Long userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    /**
     * Vérifie que l'utilisateur peut gérer le projet :
     * - Rôle LEAD dans le projet, OU
     * - Rôle OWNER ou ADMIN dans le workspace
     */
    private void assertCanManageProject(Project project, Workspace workspace, Long userId) {
        boolean isProjectLead = projectMemberRepository
            .findByProjectIdAndUserId(project.getId(), userId)
            .map(pm -> pm.getRole() == ProjectRole.LEAD)
            .orElse(false);

        if (isProjectLead) return;

        workspaceMemberRepository.findByWorkspaceIdAndUserId(workspace.getId(), userId)
            .filter(wm -> wm.getRole().name().equals("OWNER") || wm.getRole().name().equals("ADMIN"))
            .orElseThrow(() -> new BusinessException(
                "Droits insuffisants pour gérer ce projet"));
    }

    /**
     * Plafond « façon GitHub » : sur le forfait Free, un projet PRIVÉ est limité à
     * {@value #FREE_PRIVATE_PROJECT_MEMBER_LIMIT} collaborateurs (créateur inclus).
     * Les projets publics et les forfaits payants (BASIC/BUSINESS/ENTERPRISE) sont illimités.
     * Lève une {@link IllegalStateException} (→ 409) pour déclencher l'upsell côté front,
     * en miroir du plafond de workspaces de {@code WorkspaceService}.
     */
    private void enforcePrivateProjectSeatLimit(Project project) {
        if (skipSeatLimit(project)) {
            return;
        }
        if (effectiveCollaboratorIds(project).size() >= FREE_PRIVATE_PROJECT_MEMBER_LIMIT) {
            throw seatLimitExceeded();
        }
    }

    /**
     * Variante pour l'association d'une ÉQUIPE : ses membres deviennent collaborateurs du projet.
     * On rejette si l'attachement pousse le total de collaborateurs DISTINCTS au-delà du plafond —
     * sinon on contourne la limite Free en passant par une équipe (cf. QA PROJ-03).
     */
    private void enforcePrivateProjectSeatLimitForTeam(Project project, Long teamId) {
        if (skipSeatLimit(project)) {
            return;
        }
        Set<Long> ids = effectiveCollaboratorIds(project);
        teamMemberRepository.findByTeamId(teamId)
            .forEach(tm -> { if (tm.getUser() != null) ids.add(tm.getUser().getId()); });
        if (ids.size() > FREE_PRIVATE_PROJECT_MEMBER_LIMIT) {
            throw seatLimitExceeded();
        }
    }

    /** Projet public OU workspace payant = collaborateurs illimités (pas de plafond). */
    private boolean skipSeatLimit(Project project) {
        if (project.isPublic()) {
            return true;
        }
        User owner = project.getWorkspace().getOwner();
        return owner != null && owner.isPaid();
    }

    /**
     * Collaborateurs EFFECTIFS et DISTINCTS : membres directs + membres de toutes les équipes
     * associées, dédupliqués. C'est ce total qui est plafonné (sinon l'ajout via équipe contourne la limite).
     */
    private Set<Long> effectiveCollaboratorIds(Project project) {
        Set<Long> ids = new HashSet<>();
        projectMemberRepository.findByProjectId(project.getId())
            .forEach(pm -> { if (pm.getUser() != null) ids.add(pm.getUser().getId()); });
        projectTeamRepository.findByProjectId(project.getId())
            .forEach(pt -> teamMemberRepository.findByTeamId(pt.getTeam().getId())
                .forEach(tm -> { if (tm.getUser() != null) ids.add(tm.getUser().getId()); }));
        return ids;
    }

    private IllegalStateException seatLimitExceeded() {
        return new IllegalStateException(
            "Les projets privés sont limités à " + FREE_PRIVATE_PROJECT_MEMBER_LIMIT
            + " collaborateurs sur le forfait Free. Rendez ce projet public, "
            + "ou passez à un forfait payant pour inviter sans limite.");
    }

    // -------------------------------------------------------------------------
    // Mappers
    // -------------------------------------------------------------------------

    private ProjectResponse toResponse(Project project, boolean isFavorite) {
        List<ProjectMember> members = projectMemberRepository.findByProjectId(project.getId());
        List<ProjectLabel>  labels  = projectLabelRepository.findByProjectIdOrderByNameAsc(project.getId());

        User owner = project.getWorkspace().getOwner();
        String ownerName = (owner.getDisplayName() != null && !owner.getDisplayName().isBlank())
            ? owner.getDisplayName()
            : owner.getEmail();

        User creator = project.getCreatedBy();
        String creatorName = (creator.getDisplayName() != null && !creator.getDisplayName().isBlank())
            ? creator.getDisplayName()
            : creator.getEmail();

        return ProjectResponse.builder()
            .id(project.getId())
            .name(project.getName())
            .identifier(project.getIdentifier())
            .description(project.getDescription())
            .status(project.getStatus())
            .isPublic(project.isPublic())
            .isFavorite(isFavorite)
            .workspaceId(project.getWorkspace().getId())
            .workspaceSlug(project.getWorkspace().getSlug())
            .createdById(creator.getId())
            .createdByName(creatorName)
            .memberCount(members.size())
            .totalIssues((int) issueRepository.countByProjectId(project.getId()))
            .openIssues((int) issueRepository.countOpenIssues(project.getId()))
            .members(members.stream().map(this::toMemberResponse).collect(Collectors.toList()))
            .labels(labels.stream().map(this::toLabelResponse).collect(Collectors.toList()))
            .iconUrl(project.getIconUrl())
            .color(project.getColor())
            .growthMode(project.isGrowthMode())
            .createdAt(project.getCreatedAt())
            .updatedAt(project.getUpdatedAt())
            .build();
    }

    private ProjectMemberResponse toMemberResponse(ProjectMember pm) {
        User user = pm.getUser();
        String displayName = (user.getDisplayName() != null && !user.getDisplayName().isBlank())
            ? user.getDisplayName()
            : user.getEmail();

        return ProjectMemberResponse.builder()
            .id(pm.getId())
            .userId(user.getId())
            .email(user.getEmail())
            .displayName(displayName)
            .avatarUrl(user.getAvatarUrl())
            .role(pm.getRole())
            .joinedAt(pm.getJoinedAt())
            .build();
    }

    private ProjectLabelResponse toLabelResponse(ProjectLabel label) {
        return ProjectLabelResponse.builder()
            .id(label.getId())
            .name(label.getName())
            .color(label.getColor())
            .description(label.getDescription())
            .createdAt(label.getCreatedAt())
            .build();
    }
}
