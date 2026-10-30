package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunOutcome;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.GitHubPullRequests;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.MergedPullRequests;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Les trois gestes de la carte de résultat d'une mission (R78, séance n°13) : « Apply » fusionne la pull request sur
 * GitHub et termine l'issue ; « Discard » la ferme et supprime sa branche ; « Try again » écarte le résultat, poste la
 * remarque de la personne sur l'issue (l'agent la lit avec {@code get_issue}) et relance la mission. Seule la personne
 * qui a délégué tranche, une fois : le geste se garde sur la mission (le dossier de preuve est scellé à sa fin).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MissionResultService {

    private static final Pattern PULL_REQUEST =
        Pattern.compile("^https://github\\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/pull/(\\d{1,9})(?:[/?#].*)?$");

    private final DeliveryRunRepository runRepository;
    private final UserRepository userRepository;
    private final IssueGitHubLinkRepository linkRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final GitHubPullRequests pullRequests;
    private final MergedPullRequests mergedPullRequests;
    private final IssueService issueService;
    private final DeliveryService deliveryService;

    private record PullRequest(String repo, int number) {}

    /** Fusionne la pull request de l'agent sur GitHub, puis termine l'issue. */
    @Transactional
    public void apply(String slug, Long runId, Long userId) {
        DeliveryRun run = decidable(slug, runId, userId);
        PullRequest pr = pullRequest(run).orElseThrow(() ->
            new BusinessException("This result has no pull request to apply: open its branch on GitHub."));
        pullRequests.merge(workspaceId(run), pr.repo(), pr.number());
        markLink(run, pr, GitHubLinkStatus.MERGED);
        decided(run, DeliveryRunOutcome.APPLIED, userId);
        mergedPullRequests.completeIssue(run.getIssue().getId(), userId);
        log.info("Run {} : résultat appliqué ({}#{}) par {}", runId, pr.repo(), pr.number(), userId);
    }

    /** Ferme la pull request de l'agent et supprime sa branche ; sans pull request, le résultat est seulement écarté. */
    @Transactional
    public void discard(String slug, Long runId, Long userId) {
        DeliveryRun run = decidable(slug, runId, userId);
        withdraw(run);
        decided(run, DeliveryRunOutcome.DISCARDED, userId);
        log.info("Run {} : résultat écarté par {}", runId, userId);
    }

    /**
     * Relance la mission avec le même agent, écarte le résultat et poste la remarque de la personne sur l'issue : la
     * nouvelle mission lit la remarque avec le reste de l'issue. La relance d'abord : un agent qui ne peut pas repartir
     * refuse le geste avant que GitHub ferme la pull request et supprime sa branche.
     */
    @Transactional
    public DeliveryRunResponse retry(String slug, Long runId, Long userId, String note) {
        DeliveryRun run = decidable(slug, runId, userId);
        Issue issue = run.getIssue();
        DeliveryRunResponse next = deliveryService.delegate(slug, issue.getId(), run.getProviderKey(), run.getModel(), userId);
        withdraw(run);
        decided(run, DeliveryRunOutcome.RETRIED, userId);
        if (note != null && !note.isBlank()) {
            CreateIssueCommentRequest comment = new CreateIssueCommentRequest();
            comment.setContent("Try again: " + note.strip());
            issueService.addComment(slug, issue.getProject().getId(), issue.getId(), comment, userId);
        }
        log.info("Run {} : relancé par {}", runId, userId);
        return next;
    }

    // ---------------------------------------------------------------------

    /** La mission du workspace, finie avec un résultat que personne n'a encore tranché, et la personne qui l'a déléguée. */
    private DeliveryRun decidable(String slug, Long runId, Long userId) {
        DeliveryRun run = runRepository.findByIdForUpdate(runId)
            .orElseThrow(() -> new ResourceNotFoundException("Run not found"));
        var project = run.getIssue().getProject();
        if (project == null || project.getWorkspace() == null || !slug.equals(project.getWorkspace().getSlug())) {
            throw new ResourceNotFoundException("Run not found");
        }
        visibilityGuard.assertCanWrite(project, userId);
        if (run.getStartedBy() == null || !Objects.equals(run.getStartedBy().getId(), userId)) {
            throw new ForbiddenException("Only the person who delegated this task can apply, discard or retry its result.");
        }
        if (run.getStatus() != DeliveryRunStatus.DONE) throw new BusinessException("This mission has no result to review.");
        if (run.getOutcome() != null) {
            throw new BusinessException("This result was already " + run.getOutcome().name().toLowerCase() + ".");
        }
        return run;
    }

    /** Ferme la pull request de la mission et supprime sa branche, quand il y en a une. */
    private void withdraw(DeliveryRun run) {
        pullRequest(run).ifPresent(pr -> {
            pullRequests.close(workspaceId(run), pr.repo(), pr.number());
            pullRequests.deleteBranch(workspaceId(run), pr.repo(), run.getBranch());
            markLink(run, pr, GitHubLinkStatus.CLOSED);
        });
    }

    private void decided(DeliveryRun run, DeliveryRunOutcome outcome, Long userId) {
        run.setOutcome(outcome);
        run.setOutcomeBy(userRepository.getReferenceById(userId));
        run.setOutcomeAt(LocalDateTime.now());
        runRepository.save(run);
    }

    /** Le lien de l'issue vers cette pull request suit son nouveau statut, sans attendre la prochaine relecture. */
    private void markLink(DeliveryRun run, PullRequest pr, GitHubLinkStatus status) {
        linkRepository.findByIssueIdOrderByLinkedAtDesc(run.getIssue().getId()).stream()
            .filter(link -> pr.repo().equals(link.getRepoFullName()) && Objects.equals(link.getPrNumber(), pr.number()))
            .forEach(link -> {
                link.setStatus(status);
                link.setStatusCheckedAt(LocalDateTime.now());
                linkRepository.save(link);
            });
    }

    private static java.util.Optional<PullRequest> pullRequest(DeliveryRun run) {
        Matcher matcher = PULL_REQUEST.matcher(run.getResultUrl() == null ? "" : run.getResultUrl());
        return matcher.matches()
            ? java.util.Optional.of(new PullRequest(matcher.group(1), Integer.parseInt(matcher.group(2))))
            : java.util.Optional.empty();
    }

    private static Long workspaceId(DeliveryRun run) {
        return run.getIssue().getProject().getWorkspace().getId();
    }
}
