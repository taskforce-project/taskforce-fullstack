package com.taskforce.tf_api.core.service.delivery;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.dto.response.ProjectDeliveryEvent;
import com.taskforce.tf_api.core.dto.response.ProjectRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Issue;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le flux temps réel des missions d'un projet, {@code /topic/projects.{projectId}.delivery} (la vue du workflow, R166) :
 * l'état d'une mission qui change, une demande ouverte ou tranchée, une étape de plus à sa chronologie. Publié après le
 * commit, pour que la relecture de la mission trouve ce qui vient d'être écrit ; hors transaction, tout de suite.
 * Best-effort : une panne du temps réel ne fait jamais échouer la mission, l'écran se relit à sa reconnexion.
 *
 * <p>L'abonnement est réservé à qui voit le projet ({@code StompAuthInterceptor}), comme le board et ses analyses.
 * L'événement ne dit que ce que tous ceux-là peuvent lire ; ce qui dépend de la personne ({@code canDecide}) se relit.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProjectDeliveryFeed {

    static final String RUN = "run";
    static final String APPROVAL = "approval";
    static final String STEP = "step";

    private final SimpMessagingTemplate messagingTemplate;

    /** Le topic des missions d'un projet. */
    public static String topic(Long projectId) {
        return "/topic/projects." + projectId + ".delivery";
    }

    /** La mission a changé : son état, son résultat ou ses liens. */
    public void run(DeliveryRun run) {
        Long projectId = projectOf(run);
        if (projectId == null) return;
        publish(new ProjectDeliveryEvent(RUN, projectId, run.getId(), run.getIssue().getId(), statusOf(run),
            run.getOutcome() == null ? null : run.getOutcome().name(), null, null, null));
    }

    /**
     * La mission a changé d'état par une mise à jour en masse (la réclamation d'un runner), qui détache l'entité : ses
     * identifiants sont lus avant.
     */
    public void run(Long projectId, Long runId, Long issueId, DeliveryRunStatus status) {
        if (projectId == null || runId == null) return;
        publish(new ProjectDeliveryEvent(RUN, projectId, runId, issueId, status == null ? null : status.name(),
            null, null, null, null));
    }

    /** Une demande de la mission a été ouverte, signée, tranchée ou est échue. */
    public void approval(DeliveryRun run, DeliveryRunApproval approval) {
        Long projectId = projectOf(run);
        if (projectId == null || approval == null) return;
        publish(new ProjectDeliveryEvent(APPROVAL, projectId, run.getId(), run.getIssue().getId(), statusOf(run), null,
            approval.getId(), approval.getStatus() == null ? null : approval.getStatus().name(), null));
    }

    /** La chronologie de la mission a avancé : {@code last} est sa nouvelle étape en cours. */
    public void step(DeliveryRun run, DeliveryRunEvent last) {
        Long projectId = projectOf(run);
        if (projectId == null || last == null) return;
        publish(new ProjectDeliveryEvent(STEP, projectId, run.getId(), run.getIssue().getId(), statusOf(run), null,
            null, null, stepOf(last)));
    }

    /** Un événement de la chronologie, tel que la vue du projet le montre comme étape en cours. */
    public static ProjectRunResponse.Step stepOf(DeliveryRunEvent event) {
        return new ProjectRunResponse.Step(event.getSeq(), event.getKind(), event.getTool(), event.getCreatedAt());
    }

    // ---------------------------------------------------------------------

    private void publish(ProjectDeliveryEvent event) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            send(event);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send(event);
            }
        });
    }

    private void send(ProjectDeliveryEvent event) {
        try {
            messagingTemplate.convertAndSend(topic(event.projectId()), event);
        } catch (Exception ex) {
            log.warn("Publication temps réel de la mission {} échouée (projet {}) : {}", event.runId(), event.projectId(),
                ex.getMessage());
        }
    }

    /** Le projet de la mission ; null pour une mission sans issue ni projet (cas dégradé), qui n'annonce rien. */
    private static Long projectOf(DeliveryRun run) {
        if (run == null || run.getId() == null) return null;
        Issue issue = run.getIssue();
        return issue == null || issue.getProject() == null ? null : issue.getProject().getId();
    }

    private static String statusOf(DeliveryRun run) {
        return run.getStatus() == null ? null : run.getStatus().name();
    }
}
