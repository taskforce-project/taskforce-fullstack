package com.taskforce.tf_api.core.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Un ticket dont une pull request liée vient d'être fusionnée passe dans la première colonne « terminée » de son
 * projet, au nom de la personne qui a lié la PR (à défaut, de celle qui a ouvert le ticket), comme si elle l'y avait
 * déplacé : date de fin, historique, notifications et relevé du Brain OS ({@link IssueService#updateIssue}). Un ticket
 * déjà terminé ou annulé ne bouge pas, et un échec n'empêche jamais la relecture des PR.
 */
@Slf4j
@Component
public class MergedPullRequests {

    private final ObjectProvider<IssueService> issueService;
    private final IssueRepository issueRepository;
    private final IssueStatusRepository issueStatusRepository;
    private final TransactionTemplate tx;
    private final ApplicationEventPublisher events;

    /** Où va le ticket, et au nom de qui. */
    private record Move(String workspaceSlug, Long projectId, Long issueId, Long statusId, Long actorId) {}

    /**
     * Une pull request liée à un ticket a été fusionnée sur GitHub, hors de TaskForce : la mission qui l'a ouverte garde
     * cette décision de fin à son dossier, avec qui l'a prise et quand, d'après GitHub (TF-J2-7, R212 rubrique 6).
     *
     * @param mergedBy le compte GitHub qui a fusionné, s'il est connu
     * @param mergedAt l'heure de la fusion selon GitHub (ISO-8601), si elle est connue
     */
    public record PullRequestMerged(Long issueId, String repo, int number, String mergedBy, String mergedAt) {}

    @Autowired
    public MergedPullRequests(ObjectProvider<IssueService> issueService, IssueRepository issueRepository,
                              IssueStatusRepository issueStatusRepository, PlatformTransactionManager transactionManager,
                              ApplicationEventPublisher events) {
        this.issueService = issueService;
        this.issueRepository = issueRepository;
        this.issueStatusRepository = issueStatusRepository;
        this.tx = new TransactionTemplate(transactionManager);
        this.events = events;
    }

    /** Sans annonce de la fusion aux dossiers des missions. */
    public MergedPullRequests(ObjectProvider<IssueService> issueService, IssueRepository issueRepository,
                              IssueStatusRepository issueStatusRepository, PlatformTransactionManager transactionManager) {
        this(issueService, issueRepository, issueStatusRepository, transactionManager, null);
    }

    /** Annonce une fusion faite sur GitHub ; un échec ne gêne jamais la relecture des PR. */
    public void mergedOnGitHub(Long issueId, String repo, int number, String mergedBy, String mergedAt) {
        if (events == null) return;
        try {
            events.publishEvent(new PullRequestMerged(issueId, repo, number, mergedBy, mergedAt));
        } catch (RuntimeException e) {
            log.warn("Fusion de {}#{} non gardée au dossier de sa mission : {}", repo, number, e.getMessage());
        }
    }

    /** @return vrai si le ticket a été terminé */
    public boolean completeIssue(Long issueId, Long linkedById) {
        try {
            Move move = tx.execute(status -> issueRepository.findById(issueId).map(issue -> plan(issue, linkedById)).orElse(null));
            if (move == null) {
                return false;
            }
            UpdateIssueRequest request = new UpdateIssueRequest();
            request.setStatusId(move.statusId());
            issueService.getObject().updateIssue(move.workspaceSlug(), move.projectId(), move.issueId(), request, move.actorId());
            log.info("Ticket {} terminé : sa pull request a été fusionnée", move.issueId());
            return true;
        } catch (RuntimeException e) {
            log.warn("Ticket {} non terminé après la fusion de sa pull request : {}", issueId, e.getMessage());
            return false;
        }
    }

    private Move plan(Issue issue, Long linkedById) {
        IssueStatusCategory category = issue.getStatus().getCategory();
        if (issue.getCompletedAt() != null || category == IssueStatusCategory.COMPLETED
                || category == IssueStatusCategory.CANCELLED) {
            return null;
        }
        Project project = issue.getProject();
        Long actorId = linkedById != null ? linkedById : issue.getReporter().getId();
        return issueStatusRepository.findByProjectIdAndCategory(project.getId(), IssueStatusCategory.COMPLETED).stream()
            .findFirst()
            .map(done -> new Move(project.getWorkspace().getSlug(), project.getId(), issue.getId(), done.getId(), actorId))
            .orElse(null);
    }
}
