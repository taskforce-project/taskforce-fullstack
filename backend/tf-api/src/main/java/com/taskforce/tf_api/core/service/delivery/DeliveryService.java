package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.DeliveryProviderResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Orchestration de la délégation d'une tâche à un agent de livraison (TF-AGENT-DELIVERY slice 3).
 *
 * <p>Comme {@code AnalysisJobService} : cette classe crée/lit le run dans sa transaction mais ne
 * déclenche PAS le runner (@Async) elle-même — c'est le contrôleur qui lance {@link DeliveryRunner}
 * une fois le run committé, sinon le thread async pourrait démarrer avant le commit et ne pas voir
 * la ligne.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DeliveryService {

    private final DeliveryRunRepository runRepository;
    private final IssueRepository issueRepository;
    private final UserRepository userRepository;
    private final DeliveryAgentProviderRegistry registry;
    private final ProjectVisibilityGuard visibilityGuard;
    private final BrainAccessGuard access;
    private final ProjectRepository projectRepository;
    private final IssueService issueService;

    /**
     * Crée un run de délégation (QUEUED) pour une issue vers un provider disponible. Écriture sur
     * l'issue (LEAD/ADMIN/OWNER). Le contrôleur déclenche l'exécution après le commit.
     */
    @Transactional
    public DeliveryRunResponse delegate(String slug, Long issueId, String providerKey, String model, Long userId) {
        Issue issue = scopedIssue(slug, issueId);
        visibilityGuard.assertCanWrite(issue.getProject(), userId);

        DeliveryAgentProvider provider = registry.get(providerKey);
        if (provider == null) {
            throw new BusinessException("Unknown provider: " + providerKey);
        }
        if (!provider.available()) {
            throw new BusinessException("This provider isn't available yet: " + providerKey);
        }
        Project project = issue.getProject();
        String notReady = provider.unavailableReason(new DeliveryContext(userId, project.getWorkspace(), project));
        if (notReady != null) {
            throw new BusinessException(notReady);
        }

        String resolvedModel = (model != null && !model.isBlank())
            ? model.trim()
            : (provider.models().isEmpty() ? null : provider.models().get(0));

        User startedBy = userRepository.findById(userId).orElse(null);
        DeliveryRun run = DeliveryRun.builder()
            .issue(issue)
            .providerKey(provider.key())
            .model(resolvedModel)
            .status(DeliveryRunStatus.QUEUED)
            .startedBy(startedBy)
            .build();
        run = runRepository.save(run);
        // J4 : la délégation se voit, la personne d'abord ; une issue sans assigné prend pour assigné qui délègue.
        issueService.assignDelegatorIfUnassigned(issue, startedBy);

        log.info("Délégation issue {} -> provider {} (run {}, QUEUED)", issueId, provider.key(), run.getId());
        return toResponse(run);
    }

    /** Dernier run de délégation d'une issue (ou vide), pour afficher l'état courant. */
    @Transactional(readOnly = true)
    public Optional<DeliveryRunResponse> latestRun(String slug, Long issueId, Long userId) {
        Issue issue = scopedIssue(slug, issueId);
        visibilityGuard.assertCanView(issue.getProject(), userId);
        return runRepository.findTopByIssueIdOrderByCreatedAtDesc(issue.getId()).map(this::toResponse);
    }

    /** Nombre de runs renvoyés par la vue workflow (borne le payload + le rendu du canvas). */
    private static final int RUNS_CAP = 200;

    /**
     * Runs de délégation du workspace, les plus récents d'abord (vue « workflow » : les délégations
     * vers agents, plusieurs en parallèle). Borné aux projets visibles par l'utilisateur (jamais de
     * fuite d'un projet privé) et plafonné.
     */
    @Transactional(readOnly = true)
    public List<DeliveryRunResponse> listRuns(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        List<Long> projectIds = visibilityGuard.viewableProjectIds(ws.getId(), userId);
        if (projectIds.isEmpty()) return List.of();
        return runRepository.findByProjectIds(projectIds, PageRequest.of(0, RUNS_CAP))
            .stream().map(this::toResponse).toList();
    }

    /** Mappe le run en DTO DANS la transaction (les accès paresseux issue/startedBy y sont sûrs). */
    private DeliveryRunResponse toResponse(DeliveryRun r) {
        Issue issue = r.getIssue();
        Project project = issue.getProject();
        String issueKey = (project != null && issue.getSequenceNumber() != null)
            ? project.getIdentifier() + "-" + issue.getSequenceNumber()
            : null;
        return new DeliveryRunResponse(
            r.getId(),
            issue.getId(),
            issueKey,
            issue.getTitle(),
            project != null ? project.getId() : null,
            project != null ? project.getName() : null,
            r.getProviderKey(),
            r.getModel(),
            r.getStatus().name(),
            r.getSummary(),
            r.getResultUrl(),
            r.getError(),
            r.isRefused(),
            r.getStartedBy() != null ? r.getStartedBy().getId() : null,
            r.getCreatedAt(),
            r.getUpdatedAt());
    }

    /**
     * Agents de la délégation pour cette personne : chacun avec ce qui lui manque dans ce workspace et, si
     * {@code projectId} est donné, pour ce projet (OSS-5.7).
     */
    @Transactional(readOnly = true)
    public List<DeliveryProviderResponse> listProviders(String slug, Long projectId, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Project project = projectId == null ? null : projectRepository.findById(projectId)
            .filter(p -> p.getWorkspace() != null && ws.getId().equals(p.getWorkspace().getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
        DeliveryContext context = new DeliveryContext(userId, ws, project);
        return registry.all().stream().map(p -> {
            String reason = p.unavailableReason(context);
            return new DeliveryProviderResponse(p.key(), p.displayName(), p.logoKey(), p.available(), p.models(),
                reason == null, reason);
        }).toList();
    }

    /** Charge une issue en la scopant au workspace du chemin (cross-tenant -> 404, pas 403). */
    private Issue scopedIssue(String slug, Long issueId) {
        Issue issue = issueRepository.findById(issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Issue not found"));
        if (issue.getProject() == null || issue.getProject().getWorkspace() == null
            || !slug.equals(issue.getProject().getWorkspace().getSlug())) {
            throw new ResourceNotFoundException("Issue not found");
        }
        return issue;
    }
}
