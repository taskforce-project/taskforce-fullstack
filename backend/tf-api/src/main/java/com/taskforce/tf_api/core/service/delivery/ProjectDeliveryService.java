package com.taskforce.tf_api.core.service.delivery;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.dto.response.ProjectRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.dto.PageResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Les missions d'un projet et leurs demandes, en une lecture (la vue du workflow, R166) : chaque mission avec son état,
 * son étape en cours, ses liens et ses demandes encore ouvertes, page par page. La liste de l'espace s'arrête à 200
 * missions de tous les projets ; celle-ci se lit par projet, par pages bornées.
 *
 * <p>Seul un membre de l'espace qui voit le projet lit quelque chose ; ce qu'il peut décider, chaque demande le dit
 * ({@code canDecide}), comme les règles de l'espace en décident.</p>
 */
@Service
@RequiredArgsConstructor
public class ProjectDeliveryService {

    /** La taille d'une page quand l'appel n'en demande pas, et la plus grande qu'il peut demander. */
    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 50;

    private final DeliveryRunRepository runRepository;
    private final DeliveryRunEventRepository eventRepository;
    private final ProjectRepository projectRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final BrainAccessGuard access;
    private final DeliveryService deliveryService;
    private final DeliveryActivityService activityService;

    /**
     * Une page des missions du projet, les plus récentes d'abord. Une demande échue passe EXPIRED à la lecture, comme sur
     * la chronologie d'une mission : d'où une transaction d'écriture.
     */
    @Transactional
    public PageResponse<ProjectRunResponse> listRuns(String slug, Long projectId, int page, int size, Long userId) {
        Project project = viewableProject(slug, projectId, userId);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Page<DeliveryRun> runs = runRepository.findByProjectId(project.getId(), PageRequest.of(Math.max(page, 0), safeSize));
        Facts facts = facts(runs.getContent(), userId);
        return PageResponse.of(runs.map(run -> row(run, facts)));
    }

    /** Une mission du projet, comme une ligne de {@link #listRuns} : l'écran la relit quand le topic du projet l'annonce. */
    @Transactional
    public ProjectRunResponse run(String slug, Long projectId, Long runId, Long userId) {
        Project project = viewableProject(slug, projectId, userId);
        DeliveryRun run = runRepository.findInProject(runId, project.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Run not found"));
        return row(run, facts(List.of(run), userId));
    }

    /** Les missions de ces lignes qu'une lecture fait avancer : en attente d'un runner, ou en cours. */
    public static List<Long> toAdvance(Collection<ProjectRunResponse> rows) {
        return rows.stream().map(ProjectRunResponse::run)
            .filter(r -> DeliveryRunStatus.QUEUED.name().equals(r.status()) || DeliveryRunStatus.RUNNING.name().equals(r.status()))
            .map(DeliveryRunResponse::id)
            .toList();
    }

    /**
     * Le projet de l'espace du chemin, lu par un membre de cet espace qui le voit : un projet d'un autre espace répond comme
     * un projet inexistant, un projet privé aussi pour qui n'en est pas (404).
     */
    private Project viewableProject(String slug, Long projectId, Long userId) {
        Workspace workspace = access.resolveAndAuthorize(slug, userId);
        Project project = projectRepository.findByIdAndWorkspaceId(projectId, workspace.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
        visibilityGuard.assertCanView(project, userId);
        return project;
    }

    /** Ce qui accompagne des missions : leur étape en cours, qui les reprend, leurs demandes ouvertes. */
    private record Facts(Map<Long, ProjectRunResponse.Step> steps, Map<Long, Long> followedUpBy,
                         Map<Long, List<DeliveryRunActivityResponse.Approval>> approvals) {}

    /** Les faits de ces missions, lus en trois requêtes pour toute la page. */
    private Facts facts(List<DeliveryRun> runs, Long userId) {
        List<Long> ids = runs.stream().map(DeliveryRun::getId).toList();
        if (ids.isEmpty()) return new Facts(Map.of(), Map.of(), Map.of());
        Map<Long, ProjectRunResponse.Step> steps = new HashMap<>();
        for (DeliveryRunEvent event : eventRepository.findLastByRunIds(ids)) {
            steps.put(event.getRun().getId(), ProjectDeliveryFeed.stepOf(event));
        }
        // De la plus ancienne à la plus récente : la dernière reprise l'emporte.
        Map<Long, Long> followedUpBy = new HashMap<>();
        for (DeliveryRunRepository.FollowUpRow row : runRepository.findFollowUps(ids)) {
            followedUpBy.put(row.getParentId(), row.getRunId());
        }
        return new Facts(steps, followedUpBy, activityService.pendingApprovals(runs, userId));
    }

    private ProjectRunResponse row(DeliveryRun run, Facts facts) {
        ProjectRunResponse.Links links = new ProjectRunResponse.Links(
            run.getBranch(),
            pullRequestUrl(run.getResultUrl()),
            run.getParentRun() == null ? null : run.getParentRun().getId(),
            facts.followedUpBy().get(run.getId()));
        return new ProjectRunResponse(deliveryService.toResponse(run), facts.steps().get(run.getId()), links,
            facts.approvals().getOrDefault(run.getId(), List.of()));
    }

    /** L'adresse du résultat quand c'est une pull request de GitHub ; null pour un autre résultat (un commentaire, un document). */
    static String pullRequestUrl(String resultUrl) {
        return resultUrl != null && DeliveryRunner.PULL_REQUEST.matcher(resultUrl).matches() ? resultUrl : null;
    }
}
