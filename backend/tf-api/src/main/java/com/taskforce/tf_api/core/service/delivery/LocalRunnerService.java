package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.RunnerResultRequest;
import com.taskforce.tf_api.core.dto.response.RunnerClaimResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import lombok.extern.slf4j.Slf4j;

/**
 * Côté serveur du runner local de délégation (ADR-013) : file d'attente « pull », session déléguée et
 * clôture du run.
 *
 * <p><b>Règle d'autorité</b>, vérifiée à chaque appel : un runner n'agit que sur les runs du provider
 * {@code claude-code} <b>délégués par son propriétaire</b> (claim signé par Keycloak). Il ne peut donc ni
 * voir ni réclamer le travail de quelqu'un d'autre, même dans le même workspace. Tous les refus rendent
 * le même message : un appelant ne doit pas pouvoir déduire quelle vérification a échoué.</p>
 */
@Service
@Slf4j
public class LocalRunnerService {

    /** Nombre de candidats examinés par claim (les runs dont le délégant a perdu ses droits sont écartés). */
    private static final int CLAIM_BATCH = 5;
    private static final String REFUSED = "Session de délégation invalide";

    private final DeliveryRunRepository runRepository;
    private final UserRepository userRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final DeliveryRunner deliveryRunner;
    private final LocalRunnerSettings settings;

    public LocalRunnerService(
        DeliveryRunRepository runRepository,
        UserRepository userRepository,
        ProjectVisibilityGuard visibilityGuard,
        DeliveryRunner deliveryRunner,
        LocalRunnerSettings settings
    ) {
        this.runRepository = runRepository;
        this.userRepository = userRepository;
        this.visibilityGuard = visibilityGuard;
        this.deliveryRunner = deliveryRunner;
        this.settings = settings;
    }

    /**
     * Réclame le plus ancien run en attente du propriétaire du runner, ou vide s'il n'y en a pas.
     *
     * <p>Les droits du délégant sont <b>réévalués ici</b>, pas seulement à la délégation : entre les deux, il
     * a pu perdre l'écriture sur le projet. Un tel run est clos en échec au lieu d'être exécuté.</p>
     */
    @Transactional
    public Optional<RunnerClaimResponse> claim(RunnerIdentity runner) {
        User owner = activeOwner(runner);
        List<DeliveryRun> candidates = runRepository.findClaimable(
            ClaudeCodeProvider.KEY, DeliveryRunStatus.QUEUED, owner.getId(), PageRequest.of(0, CLAIM_BATCH));

        for (DeliveryRun candidate : candidates) {
            Long runId = candidate.getId();
            Issue issue = candidate.getIssue();
            Project project = issue.getProject();

            if (!visibilityGuard.canWrite(project, owner.getId())) {
                log.warn("Run {} écarté au claim : {} n'a plus l'écriture sur le projet {}",
                    runId, owner.getId(), project.getId());
                deliveryRunner.complete(runId, new DeliveryPoll(DeliveryRunStatus.FAILED, null, null,
                    "The person who delegated this task no longer has write access to the project."));
                continue;
            }

            LocalDateTime now = LocalDateTime.now();
            // Tout est lu AVANT la mise à jour : elle vide le contexte de persistance (entités détachées).
            RunnerClaimResponse claim = new RunnerClaimResponse(
                runId,
                issue.getId(),
                project.getIdentifier() + "-" + issue.getSequenceNumber(),
                issue.getTitle(),
                issue.getDescription(),
                project.getId(),
                project.getName(),
                project.getWorkspace().getSlug(),
                project.getRepoFullName(),
                candidate.getModel(),
                now.plus(settings.sessionTtl()));

            String externalRef = "runner:" + runner.clientId() + ":" + UUID.randomUUID();
            int won = runRepository.claim(runId, runner.clientId(), externalRef, now,
                DeliveryRunStatus.QUEUED, DeliveryRunStatus.RUNNING);
            if (won == 1) {
                log.info("Run {} réclamé par le runner {} (issue {}, pour {})",
                    runId, runner.clientId(), claim.issueKey(), owner.getId());
                return Optional.of(claim);
            }
            // Perdu : un autre runner du même propriétaire a été plus rapide. On passe au suivant.
        }
        return Optional.empty();
    }

    /** Signe de vie du runner sur son run. Refusé si le run ne lui appartient plus ou est terminé. */
    @Transactional
    public void heartbeat(Long runId, RunnerIdentity runner) {
        int touched = runRepository.heartbeat(runId, runner.clientId(), LocalDateTime.now(), DeliveryRunStatus.RUNNING);
        if (touched != 1) {
            throw new ForbiddenException(REFUSED);
        }
    }

    /**
     * Clôt le run avec le résultat du runner, puis laisse {@link DeliveryRunner#complete} déplacer l'issue
     * (« In review by AI » ou « Blocked »). Rien n'est fusionné ni accepté ici : la décision reste humaine.
     */
    @Transactional
    public void complete(Long runId, RunnerIdentity runner, RunnerResultRequest result) {
        DeliveryRun run = runRepository.findByIdForUpdate(runId)
            .orElseThrow(() -> new ForbiddenException(REFUSED));
        assertHeldBy(run, runner);

        boolean done = "DONE".equals(result.status());
        if (done && (result.summary() == null || result.summary().isBlank())) {
            throw new BusinessException("Un résultat DONE doit porter un résumé");
        }
        DeliveryPoll poll = done
            ? new DeliveryPoll(DeliveryRunStatus.DONE, result.summary().trim(), result.resultUrl(), null)
            : new DeliveryPoll(DeliveryRunStatus.FAILED, null, null,
                (result.error() == null || result.error().isBlank()) ? "The runner reported a failure." : result.error().trim());
        deliveryRunner.complete(runId, poll);
    }

    /**
     * Ouvre la session déléguée d'une requête : vérifie que le run est bien tenu par ce runner, encore en
     * cours et dans sa durée de vie, puis rend le périmètre (workspace, projet) et le délégant au nom
     * duquel la requête sera évaluée. Appelé par {@code DeliverySessionFilter} à chaque requête.
     */
    @Transactional(readOnly = true)
    public DeliverySession openSession(Long runId, RunnerIdentity runner) {
        DeliveryRun run = runRepository.findById(runId)
            .orElseThrow(() -> new ForbiddenException(REFUSED));
        assertHeldBy(run, runner);

        LocalDateTime claimedAt = run.getClaimedAt();
        if (claimedAt == null || LocalDateTime.now().isAfter(claimedAt.plus(settings.sessionTtl()))) {
            log.warn("Session déléguée expirée : run {} (runner {})", runId, runner.clientId());
            throw new ForbiddenException(REFUSED);
        }
        Project project = run.getIssue().getProject();
        User owner = run.getStartedBy();
        return new DeliverySession(
            run.getId(),
            project.getWorkspace().getSlug(),
            project.getId(),
            owner.getEmail(),
            owner.getKeycloakId(),
            runner.clientId());
    }

    // ---------------------------------------------------------------------

    /** Le run est du bon provider, en cours, réclamé par CE runner, et délégué par SON propriétaire actif. */
    private void assertHeldBy(DeliveryRun run, RunnerIdentity runner) {
        User owner = run.getStartedBy();
        boolean held = ClaudeCodeProvider.KEY.equals(run.getProviderKey())
            && run.getStatus() == DeliveryRunStatus.RUNNING
            && runner.clientId().equals(run.getClaimedBy())
            && owner != null
            && owner.getEmail() != null
            && owner.getEmail().equalsIgnoreCase(runner.ownerEmail())
            && Boolean.TRUE.equals(owner.getIsActive());
        if (!held) {
            log.warn("Accès runner refusé : run {} (statut {}, tenu par {}) demandé par {}",
                run.getId(), run.getStatus(), run.getClaimedBy(), runner.clientId());
            throw new ForbiddenException(REFUSED);
        }
    }

    private User activeOwner(RunnerIdentity runner) {
        return userRepository.findByEmail(runner.ownerEmail())
            .filter(u -> Boolean.TRUE.equals(u.getIsActive()))
            .orElseThrow(() -> new ForbiddenException(REFUSED));
    }
}
