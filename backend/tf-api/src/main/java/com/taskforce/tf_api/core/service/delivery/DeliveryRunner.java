package com.taskforce.tf_api.core.service.delivery;

import java.util.Objects;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Exécution en arrière-plan d'un run de délégation (TF-AGENT-DELIVERY) : {@code dispatch -> poll ->
 * résultat}, puis auto-move de l'issue vers une colonne dédiée (slice 4). Bean séparé de
 * {@link DeliveryService} (Spring n'applique pas {@code @Async} sur un auto-appel) ; déclenché par le
 * contrôleur après le commit du run.
 *
 * <p><b>Auto-move (slice 4)</b> : à la fin, l'issue passe dans une colonne <b>« In review by AI »</b>
 * (DONE) ou <b>« Blocked »</b> (FAILED). Ces statuts sont créés à la volée s'ils manquent : ce sont des
 * <b>colonnes normales, custom et supprimables</b> (pas des défauts) - l'humain peut toujours déplacer
 * l'issue à la main, et la décision d'accepter le résultat reste humaine.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DeliveryRunner {

    private static final String STATUS_IN_REVIEW = "In review by AI";
    private static final String STATUS_BLOCKED   = "Blocked";
    private static final String COLOR_IN_REVIEW  = "#8b5cf6"; // violet
    private static final String COLOR_BLOCKED     = "#ef4444"; // rouge

    private final DeliveryRunRepository runRepository;
    private final DeliveryAgentProviderRegistry registry;
    private final IssueStatusRepository issueStatusRepository;
    private final IssueRepository issueRepository;

    @Async
    @Transactional
    public void execute(Long runId) {
        DeliveryRun run = runRepository.findById(runId).orElse(null);
        if (run == null) {
            log.warn("Delivery run {} introuvable", runId);
            return;
        }
        try {
            DeliveryAgentProvider provider = registry.get(run.getProviderKey());
            if (provider == null) {
                throw new IllegalStateException("Provider inconnu : " + run.getProviderKey());
            }

            Issue issue = run.getIssue();
            Project project = issue.getProject();
            Long workspaceId = (project != null && project.getWorkspace() != null)
                ? project.getWorkspace().getId() : null;
            AgentBrief brief = new AgentBrief(
                issue.getId(), workspaceId, issue.getTitle(), issue.getDescription(),
                project != null ? project.getRepoFullName() : null, run.getModel());

            run.setStatus(DeliveryRunStatus.RUNNING);
            DeliveryDispatch dispatch = provider.dispatch(brief);
            run.setExternalRef(dispatch.externalRef());
            runRepository.save(run);

            // Provider synchrone (ex. ClaudeApiProvider) : résultat déjà là ; sinon on poll (async).
            DeliveryPoll poll = dispatch.immediateResult() != null
                ? dispatch.immediateResult()
                : provider.poll(dispatch.externalRef());
            switch (poll.status()) {
                case DONE -> {
                    run.setStatus(DeliveryRunStatus.DONE);
                    run.setSummary(poll.summary());
                    run.setResultUrl(poll.resultUrl());
                    moveIssueTo(run, STATUS_IN_REVIEW, IssueStatusCategory.STARTED, COLOR_IN_REVIEW);
                }
                case FAILED -> {
                    run.setStatus(DeliveryRunStatus.FAILED);
                    run.setError(poll.error());
                    moveIssueTo(run, STATUS_BLOCKED, IssueStatusCategory.STARTED, COLOR_BLOCKED);
                }
                default -> run.setStatus(DeliveryRunStatus.RUNNING); // encore en cours (poll ultérieur = plus tard)
            }
            runRepository.save(run);
            log.info("Delivery run {} : {} (provider {})", runId, run.getStatus(), run.getProviderKey());
        } catch (Exception e) {
            run.setStatus(DeliveryRunStatus.FAILED);
            run.setError(e.getMessage());
            moveIssueTo(run, STATUS_BLOCKED, IssueStatusCategory.STARTED, COLOR_BLOCKED);
            runRepository.save(run);
            log.warn("Delivery run {} en échec : {}", runId, e.getMessage());
        }
    }

    /**
     * Déplace l'issue du run vers une colonne (créée si absente : custom, non-défaut, supprimable).
     * Best-effort : un échec de déplacement ne casse pas la mise à jour du run.
     */
    private void moveIssueTo(DeliveryRun run, String name, IssueStatusCategory category, String color) {
        try {
            Issue issue = run.getIssue();
            Project project = issue.getProject();
            if (project == null) {
                return;
            }
            IssueStatus status = issueStatusRepository
                .findByProjectIdAndName(project.getId(), name)
                .orElseGet(() -> createStatus(project, name, category, color));
            issue.setStatus(status);
            issueRepository.save(issue);
        } catch (Exception e) {
            log.warn("Delivery run {} : déplacement de l'issue vers '{}' échoué : {}",
                run.getId(), name, e.getMessage());
        }
    }

    /** Crée une colonne de statut à la fin du board (position max + 1), custom et supprimable. */
    private IssueStatus createStatus(Project project, String name, IssueStatusCategory category, String color) {
        int maxPos = issueStatusRepository.findByProjectIdOrderByPosition(project.getId()).stream()
            .map(IssueStatus::getPosition)
            .filter(Objects::nonNull)
            .mapToInt(Short::intValue)
            .max()
            .orElse(0);
        IssueStatus status = IssueStatus.builder()
            .project(project)
            .name(name)
            .category(category)
            .color(color)
            .position((short) (maxPos + 1))
            .isDefault(false)
            .build();
        return issueStatusRepository.save(status);
    }
}
