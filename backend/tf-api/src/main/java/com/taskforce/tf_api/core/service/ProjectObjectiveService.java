package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.ProjectObjectiveRequest;
import com.taskforce.tf_api.core.dto.response.ProjectObjectiveResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectObjective;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectObjectiveRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * L'objectif d'un projet (la vue du workflow, lot W1) : le but en une phrase, une date visée si l'on veut, d'un à cinq
 * critères de réussite. Un projet en a un ou aucun (V133).
 *
 * <p>Service <b>dédié</b>, comme {@link ProjectRepoService} : {@link ProjectService} et ses tests restent tels quels. Les
 * droits se vérifient dans l'ordre du reste du projet : membre de l'espace (sinon ce que fait
 * {@code ProjectService.resolveWorkspaceAndAssertMember}), puis un projet de cet espace que l'appelant voit (404 sinon :
 * on ne révèle pas un projet privé), puis, pour poser ou retirer l'objectif, la règle de gestion du projet : son
 * responsable (LEAD), ou un propriétaire ou administrateur de l'espace. Elle refuse en 403, et {@code canEdit} la
 * reprend telle quelle.</p>
 *
 * <p>Poser ou retirer l'objectif entre au journal d'audit après le commit, sans le texte.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectObjectiveService {

    /** Le nombre de critères de réussite d'un objectif, au plus. */
    static final int MAX_CRITERIA = 5;

    /** La longueur du but, au plus : celle de sa colonne. */
    static final int MAX_GOAL = 280;

    /** La longueur d'un critère, au plus. */
    static final int MAX_CRITERION = 200;

    /** Les années où peut tomber la date visée : sans borne, +9999999-01-01 passait la validation. */
    static final int MIN_TARGET_YEAR = 2000;
    static final int MAX_TARGET_YEAR = 2100;

    static final String CANNOT_EDIT =
        "Only the project's lead or a workspace admin can change its objective. Ask one of them to do it.";

    private final ProjectObjectiveRepository objectiveRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final UserRepository userRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final AuditService audit;

    /** L'objectif du projet, ou l'objectif vide quand il n'en a pas. */
    @Transactional(readOnly = true)
    public ProjectObjectiveResponse get(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveViewableProject(workspaceSlug, projectId, userId);
        boolean canEdit = canEdit(project, userId);
        return objectiveRepository.findById(project.getId())
            .map(objective -> toResponse(objective, canEdit))
            .orElseGet(() -> ProjectObjectiveResponse.none(canEdit));
    }

    /**
     * Pose l'objectif du projet, ou le remplace en entier. Le but et chaque critère sont pris sans les espaces qui les
     * entourent ; un texte qui reste vide est refusé.
     */
    @Transactional
    public ProjectObjectiveResponse set(String workspaceSlug, Long projectId, Long userId, ProjectObjectiveRequest request) {
        Project project = resolveViewableProject(workspaceSlug, projectId, userId);
        assertCanEdit(project, userId);

        // La requête est déjà validée (@Valid) ; ces gardes valent pour le texte une fois les espaces retirés, et pour un
        // appel qui ne passe pas par le contrôleur.
        String goal = request.goal() == null ? "" : request.goal().strip();
        if (goal.isEmpty()) {
            throw new BusinessException("Write the goal of the project in one sentence.");
        }
        if (goal.length() > MAX_GOAL) {
            throw new BusinessException("The goal is 280 characters at most: shorten it.");
        }
        List<String> criteria = new ArrayList<>();
        for (String criterion : request.criteria() == null ? List.<String>of() : request.criteria()) {
            String text = criterion == null ? "" : criterion.strip();
            if (text.isEmpty()) {
                throw new BusinessException("A success criterion can't be empty: write it, or remove it.");
            }
            if (text.length() > MAX_CRITERION) {
                throw new BusinessException("A success criterion is 200 characters at most: shorten it.");
            }
            criteria.add(text);
        }
        if (criteria.isEmpty() || criteria.size() > MAX_CRITERIA) {
            throw new BusinessException("Give one to five success criteria.");
        }
        LocalDate targetDate = request.targetDate();
        if (targetDate != null && (targetDate.getYear() < MIN_TARGET_YEAR || targetDate.getYear() > MAX_TARGET_YEAR)) {
            throw new BusinessException("Pick a target date between 2000 and 2100.");
        }

        User author = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        ProjectObjective objective = objectiveRepository.findById(project.getId())
            .orElseGet(() -> ProjectObjective.builder().projectId(project.getId()).build());
        objective.setGoal(goal);
        objective.setTargetDate(targetDate);
        objective.setCriteria(criteria);
        objective.setUpdatedBy(author);
        objective.setUpdatedAt(LocalDateTime.now());
        ProjectObjective saved = objectiveRepository.save(objective);

        record(project, userId, "set", saved);
        log.info("Projet {} : objectif posé par {} ({} critère(s))", project.getId(), userId, criteria.size());
        return toResponse(saved, true);
    }

    /** Retire l'objectif du projet ; sans objectif, rien ne change. Rend l'objectif vide. */
    @Transactional
    public ProjectObjectiveResponse clear(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveViewableProject(workspaceSlug, projectId, userId);
        assertCanEdit(project, userId);

        objectiveRepository.findById(project.getId()).ifPresent(objective -> {
            objectiveRepository.delete(objective);
            record(project, userId, "cleared", objective);
            log.info("Projet {} : objectif retiré par {}", project.getId(), userId);
        });
        return ProjectObjectiveResponse.none(true);
    }

    // -------------------------------------------------------------------------
    // Droits
    // -------------------------------------------------------------------------

    /**
     * L'espace du chemin, dont l'appelant est membre, puis un projet de cet espace qu'il voit. Mêmes réponses que
     * {@link ProjectService} : l'espace inconnu ou le projet d'un autre espace en 404, un non-membre de l'espace refusé, un
     * projet privé qu'il ne voit pas en 404.
     */
    private Project resolveViewableProject(String workspaceSlug, Long projectId, Long userId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), userId)) {
            throw new BusinessException("You're not a member of this workspace");
        }
        Project project = projectRepository.findByIdAndWorkspaceId(projectId, workspace.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
        visibilityGuard.assertCanView(project, userId);
        return project;
    }

    /**
     * La règle de gestion du projet, celle de {@code ProjectService.assertCanManageProject} : son responsable (LEAD), ou
     * un propriétaire ou administrateur de l'espace.
     */
    private boolean canEdit(Project project, Long userId) {
        boolean lead = projectMemberRepository.findByProjectIdAndUserId(project.getId(), userId)
            .map(member -> member.getRole() == ProjectRole.LEAD)
            .orElse(false);
        return lead || visibilityGuard.isWorkspaceAdmin(project.getWorkspace().getId(), userId);
    }

    private void assertCanEdit(Project project, Long userId) {
        if (!canEdit(project, userId)) {
            throw new ForbiddenException(CANNOT_EDIT);
        }
    }

    // -------------------------------------------------------------------------

    /** Le journal d'audit, après le commit : ce qui a changé, le nombre de critères, une date visée ou non ; pas le texte. */
    private void record(Project project, Long userId, String change, ProjectObjective objective) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("change", change);
        details.put("criteria", objective.getCriteria() == null ? 0 : objective.getCriteria().size());
        details.put("targetDate", objective.getTargetDate() != null);
        audit.recordAfterCommit(project.getWorkspace().getId(), userId, AuditService.PROJECT_OBJECTIVE_CHANGED, "project",
            String.valueOf(project.getId()), details);
    }

    private static ProjectObjectiveResponse toResponse(ProjectObjective objective, boolean canEdit) {
        List<String> criteria = objective.getCriteria() == null ? List.of()
            : objective.getCriteria().stream().filter(Objects::nonNull).toList();
        return new ProjectObjectiveResponse(objective.getGoal(), objective.getTargetDate(), criteria,
            nameOf(objective.getUpdatedBy()), objective.getUpdatedAt(), canEdit);
    }

    /** Le nom affiché d'une personne, sinon son adresse, comme ailleurs dans le projet. */
    private static String nameOf(User user) {
        if (user == null) return null;
        return user.getDisplayName() != null && !user.getDisplayName().isBlank() ? user.getDisplayName() : user.getEmail();
    }
}
