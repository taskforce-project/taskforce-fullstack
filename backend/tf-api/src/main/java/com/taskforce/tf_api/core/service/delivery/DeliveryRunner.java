package com.taskforce.tf_api.core.service.delivery;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Exécution en arrière-plan d'un run de délégation (TF-AGENT-DELIVERY slice 3) : {@code dispatch -> poll
 * -> résultat}. Bean séparé de {@link DeliveryService} (Spring n'applique pas {@code @Async} sur un
 * auto-appel). Le contrôleur le déclenche après le commit du run.
 *
 * <p>Slice 3 : un seul {@code poll} après le dispatch (le provider stub renvoie immédiatement DONE).
 * Le polling répété / les webhooks pour les vrais providers asynchrones = slice 4.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DeliveryRunner {

    private final DeliveryRunRepository runRepository;
    private final DeliveryAgentProviderRegistry registry;

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
            AgentBrief brief = new AgentBrief(
                issue.getId(), issue.getTitle(), issue.getDescription(),
                project != null ? project.getRepoFullName() : null, run.getModel());

            run.setStatus(DeliveryRunStatus.RUNNING);
            DeliveryDispatch dispatch = provider.dispatch(brief);
            run.setExternalRef(dispatch.externalRef());
            runRepository.save(run);

            DeliveryPoll poll = provider.poll(dispatch.externalRef());
            switch (poll.status()) {
                case DONE -> {
                    run.setStatus(DeliveryRunStatus.DONE);
                    run.setSummary(poll.summary());
                    run.setResultUrl(poll.resultUrl());
                }
                case FAILED -> {
                    run.setStatus(DeliveryRunStatus.FAILED);
                    run.setError(poll.error());
                }
                default -> run.setStatus(DeliveryRunStatus.RUNNING); // encore en cours (poll ultérieur = slice 4)
            }
            runRepository.save(run);
            log.info("Delivery run {} : {} (provider {})", runId, run.getStatus(), run.getProviderKey());
        } catch (Exception e) {
            run.setStatus(DeliveryRunStatus.FAILED);
            run.setError(e.getMessage());
            runRepository.save(run);
            log.warn("Delivery run {} en échec : {}", runId, e.getMessage());
        }
    }
}
