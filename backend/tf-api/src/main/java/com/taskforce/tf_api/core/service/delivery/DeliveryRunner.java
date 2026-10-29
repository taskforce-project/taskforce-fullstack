package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkType;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueGitHubLink;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.service.NotificationService;

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
    // Palette de la direction artistique (V93) : rose pour la revue d'un agent, rouge pour le blocage.
    private static final String COLOR_IN_REVIEW  = "#f99bc3";
    private static final String COLOR_BLOCKED     = "#e14322";

    private final DeliveryRunRepository runRepository;
    private final DeliveryAgentProviderRegistry registry;
    private final IssueStatusRepository issueStatusRepository;
    private final IssueRepository issueRepository;
    private final NotificationService notificationService;
    private final IssueGitHubLinkRepository linkRepository;
    private final MissionEvidenceService evidenceService;

    /** Adresse d'une pull request sur GitHub : le dépôt et le numéro. */
    private static final Pattern PULL_REQUEST =
        Pattern.compile("^https://github\\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/pull/(\\d{1,9})(?:[/?#].*)?$");

    /** Intervalle minimal entre deux lectures d'un provider « push » pour un même run (API externe, quotas). */
    static final Duration POLL_EVERY = Duration.ofSeconds(20);
    private final Map<Long, Instant> lastPolled = new ConcurrentHashMap<>();

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
                throw new IllegalStateException("Unknown provider: " + run.getProviderKey());
            }
            if (provider.pullBased()) {
                // Runner local (ADR-013) : rien à dispatcher, le backend ne peut pas joindre le poste de
                // l'utilisateur. Le run reste QUEUED ; le claim du runner le passera RUNNING. On n'écrit
                // RIEN ici : une sauvegarde de cette copie pourrait écraser un claim arrivé entre-temps.
                log.info("Delivery run {} : en attente d'un runner local (provider {})", runId, run.getProviderKey());
                return;
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

            // Provider synchrone : résultat déjà là ; sinon on poll (async).
            DeliveryPoll poll = dispatch.immediateResult() != null
                ? dispatch.immediateResult()
                : provider.poll(dispatch.externalRef(), workspaceId);
            applyPoll(run, poll);
            runRepository.save(run);
            log.info("Delivery run {} : {} (provider {})", runId, run.getStatus(), run.getProviderKey());
        } catch (Exception e) {
            failRun(run, e.getMessage());
            log.warn("Delivery run {} en échec : {}", runId, e.getMessage());
        }
    }

    /**
     * Ré-interroge un run <b>asynchrone</b> encore en cours et applique
     * l'avancement. Appelé par le contrôleur sur lecture du run (le polling front fait ainsi progresser
     * l'état jusqu'au terminal). No-op si le run n'est pas RUNNING, sans handle, ou déjà résolu par un
     * résultat immédiat (providers synchrones). Seule exception : un run encore en attente d'un provider
     * « pull » est clos s'il a dépassé son délai de réclamation ({@link #expireIfUnclaimed}). Bean séparé,
     * transaction propre.
     */
    @Transactional
    public void refresh(Long runId) {
        DeliveryRun run = runRepository.findById(runId).orElse(null);
        if (run == null) {
            return;
        }
        // Runner local (ADR-013) : un run que personne ne réclame ne doit pas rester « en attente » pour toujours.
        if (run.getStatus() == DeliveryRunStatus.QUEUED) {
            expireIfUnclaimed(run, LocalDateTime.now());
            return;
        }
        if (run.getStatus() != DeliveryRunStatus.RUNNING || run.getExternalRef() == null) {
            return;
        }
        DeliveryAgentProvider provider = registry.get(run.getProviderKey());
        if (provider == null) {
            return;
        }
        Instant now = Instant.now();
        Instant last = lastPolled.get(runId);
        if (last != null && last.plus(POLL_EVERY).isAfter(now)) {
            return;
        }
        lastPolled.put(runId, now);
        try {
            Issue issue = run.getIssue();
            Project project = issue != null ? issue.getProject() : null;
            Long workspaceId = (project != null && project.getWorkspace() != null)
                ? project.getWorkspace().getId() : null;
            applyPoll(run, provider.poll(run.getExternalRef(), workspaceId));
            runRepository.save(run);
            if (run.getStatus() != DeliveryRunStatus.RUNNING) {
                lastPolled.remove(runId);
            }
        } catch (Exception e) {
            failRun(run, e.getMessage());
            log.warn("Delivery run {} (refresh) en échec : {}", runId, e.getMessage());
        }
    }

    /**
     * Clôt en échec un run « pull » que personne n'a réclamé dans le délai de son provider
     * ({@link DeliveryAgentProvider#claimTimeout()}) : aucun runner allumé pour son délégant. La clôture est une
     * mise à jour CONDITIONNELLE (encore en attente, sans runner) : un runner qui réclame au même instant gagne
     * toujours, rien n'écrase son claim. Renvoie {@code true} si le run a été clos ici.
     */
    boolean expireIfUnclaimed(DeliveryRun run, LocalDateTime now) {
        if (run.getStatus() != DeliveryRunStatus.QUEUED || run.getClaimedBy() != null || run.getCreatedAt() == null) {
            return false;
        }
        DeliveryAgentProvider provider = registry.get(run.getProviderKey());
        Duration timeout = provider != null && provider.pullBased() ? provider.claimTimeout() : null;
        if (timeout == null || !now.isAfter(run.getCreatedAt().plus(timeout))) {
            return false;
        }
        Long runId = run.getId();
        int closed = runRepository.expireUnclaimed(runId, unclaimedMessage(timeout), now,
            DeliveryRunStatus.QUEUED, DeliveryRunStatus.FAILED);
        if (closed != 1) {
            return false; // réclamé entre-temps : le runner a gagné
        }
        // La mise à jour vide le contexte de persistance : on relit le run avant de déplacer son issue.
        runRepository.findById(runId).ifPresent(expired -> {
            moveIssueTo(expired, STATUS_BLOCKED, IssueStatusCategory.STARTED, COLOR_BLOCKED);
            notifyFinished(expired);
        });
        log.info("Delivery run {} clos : aucun runner ne l'a réclamé en {} min", runId, timeout.toMinutes());
        return true;
    }

    /** Message d'un run jamais réclamé : ce qui s'est passé et quoi faire, dans la langue de l'interface. */
    static String unclaimedMessage(Duration timeout) {
        return "No runner picked this task up within " + timeout.toMinutes() + " min. Set up your runner in"
            + " Settings > Agents, start it on your machine, then delegate the task again.";
    }

    /**
     * Clôt un run avec un résultat <b>poussé de l'extérieur</b> (runner local, ADR-013) : même traitement
     * qu'un résultat obtenu par {@code poll}, donc même auto-move de l'issue. Les contrôles d'autorité
     * (run réclamé par ce runner, encore en cours) sont faits par l'appelant, {@link LocalRunnerService}.
     * No-op si le run est introuvable ou déjà terminé.
     */
    @Transactional
    public void complete(Long runId, DeliveryPoll result) {
        DeliveryRun run = runRepository.findById(runId).orElse(null);
        if (run == null || run.getStatus() == DeliveryRunStatus.DONE || run.getStatus() == DeliveryRunStatus.FAILED) {
            return;
        }
        applyPoll(run, result);
        runRepository.save(run);
        log.info("Delivery run {} : {} (résultat poussé, provider {})", runId, run.getStatus(), run.getProviderKey());
    }

    /**
     * Applique le résultat d'un poll au run : DONE -> « In review by AI », FAILED -> « Blocked », sinon RUNNING. Une
     * mission qui a un dossier de preuve y est close ici, quelle que soit la fin : résultat du runner, runner perdu.
     */
    private void applyPoll(DeliveryRun run, DeliveryPoll poll) {
        switch (poll.status()) {
            case DONE -> {
                run.setStatus(DeliveryRunStatus.DONE);
                run.setSummary(poll.summary());
                run.setResultUrl(poll.resultUrl());
                evidenceService.end(run, poll);
                linkPullRequest(run);
                moveIssueTo(run, STATUS_IN_REVIEW, IssueStatusCategory.STARTED, COLOR_IN_REVIEW);
                notifyFinished(run);
            }
            case FAILED -> {
                run.setStatus(DeliveryRunStatus.FAILED);
                run.setError(poll.error());
                evidenceService.end(run, poll);
                // Une mission refusée au départ par une règle n'est pas une panne : l'issue reste où elle est (R38).
                if (!run.isRefused()) moveIssueTo(run, STATUS_BLOCKED, IssueStatusCategory.STARTED, COLOR_BLOCKED);
                notifyFinished(run);
            }
            default -> run.setStatus(DeliveryRunStatus.RUNNING); // encore en cours (poll ultérieur)
        }
    }

    /**
     * La pull request ouverte par l'agent est liée à son ticket : elle apparaît dans l'onglet GitHub avec son statut, et
     * sa fusion terminera le ticket. Une adresse qui n'est pas celle d'une PR de GitHub ne lie rien. Best-effort.
     */
    private void linkPullRequest(DeliveryRun run) {
        try {
            Matcher matcher = PULL_REQUEST.matcher(run.getResultUrl() == null ? "" : run.getResultUrl());
            if (!matcher.matches()) {
                return;
            }
            String repo = matcher.group(1);
            int number = Integer.parseInt(matcher.group(2));
            Issue issue = run.getIssue();
            if (linkRepository.existsByIssueIdAndRepoFullNameAndPrNumber(issue.getId(), repo, number)) {
                return;
            }
            linkRepository.save(IssueGitHubLink.builder()
                .issue(issue)
                .linkType(GitHubLinkType.PR)
                .repoFullName(repo)
                .prNumber(number)
                .prUrl("https://github.com/" + repo + "/pull/" + number)
                .status(GitHubLinkStatus.OPEN)
                .linkedBy(run.getStartedBy())
                .build());
        } catch (Exception e) {
            log.warn("Delivery run {} : pull request non liée à son ticket : {}", run.getId(), e.getMessage());
        }
    }

    private void failRun(DeliveryRun run, String error) {
        run.setStatus(DeliveryRunStatus.FAILED);
        run.setError(error);
        moveIssueTo(run, STATUS_BLOCKED, IssueStatusCategory.STARTED, COLOR_BLOCKED);
        runRepository.save(run);
        notifyFinished(run);
    }

    /**
     * Prévient la personne qui a délégué que son run est terminé ou en échec (OSS-5.5), avec le résumé ou l'erreur.
     * Best-effort : une notification manquée ne doit pas défaire la clôture du run.
     */
    private void notifyFinished(DeliveryRun run) {
        try {
            DeliveryAgentProvider provider = registry.get(run.getProviderKey());
            String agent = provider != null ? provider.displayName() : "The agent";
            boolean done = run.getStatus() == DeliveryRunStatus.DONE;
            if (!done && run.isRefused()) {
                notificationService.notifyAgentRunNotStarted(run.getIssue(), run.getStartedBy(), agent, run.getError());
                return;
            }
            notificationService.notifyAgentRunFinished(run.getIssue(), run.getStartedBy(), agent, done,
                done ? run.getSummary() : run.getError());
        } catch (Exception e) {
            log.warn("Delivery run {} : notification de fin non envoyée : {}", run.getId(), e.getMessage());
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
