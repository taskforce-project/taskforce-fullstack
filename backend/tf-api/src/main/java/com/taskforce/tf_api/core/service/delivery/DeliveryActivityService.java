package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.RunnerApprovalResponse;
import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.NotificationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Activité d'un run du runner local : chronologie en direct (OSS-5.3) et demandes de validation (OSS-5.4).
 *
 * <p>Côté runner, l'autorité (run tenu par CE runner, délégué par son propriétaire) est vérifiée par
 * {@link LocalRunnerService} avant tout appel ici. Côté utilisateur, la chronologie se lit comme le run (projet
 * visible), mais une demande ne se décide que par la personne qui a délégué : l'action s'exécute sur SA machine.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DeliveryActivityService {

    /** Plafond de la chronologie d'un run : au-delà, les événements sont ignorés (le run, lui, continue). */
    static final int MAX_EVENTS_PER_RUN = 500;
    static final int MAX_TEXT = 2000;
    /** Lecture d'une page de chronologie par le front. */
    static final int PAGE = 200;

    private final DeliveryRunRepository runRepository;
    private final DeliveryRunEventRepository eventRepository;
    private final DeliveryRunApprovalRepository approvalRepository;
    private final UserRepository userRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final NotificationService notificationService;
    private final LocalRunnerSettings settings;
    private final MissionEvidenceService evidenceService;

    /** Type de l'événement du dossier de preuve pour chaque sorte d'événement du runner. */
    private static final Map<String, String> EVIDENCE_TYPE = Map.of(
        "start", "note", "text", "note", "tool", "action.requested", "error", "action.result", "denied", "action.decided",
        "decision", "action.decided", "exit", "exit.result", "limit", "limit.reached");
    /** Les décisions des règles vont au dossier, pas à la chronologie affichée : une ligne par action la noierait. */
    private static final Set<String> EVIDENCE_ONLY = Set.of("decision");

    // --------------------------------------------------------------------- runner (autorité déjà vérifiée)

    /**
     * Ajoute des événements à la suite de la chronologie et du dossier de preuve ; le run est verrouillé par
     * l'appelant. La chronologie a son plafond d'affichage ; le dossier, le sien, plus haut, et le dit quand il est atteint.
     */
    @Transactional
    public void appendEvents(DeliveryRun run, List<RunnerEventsRequest.Event> events) {
        int seq = eventRepository.maxSeq(run.getId());
        for (RunnerEventsRequest.Event event : events) {
            evidenceService.append(run, EVIDENCE_TYPE.getOrDefault(event.kind(), "note"), actorOf(run, event), evidenceData(event));
            if (EVIDENCE_ONLY.contains(event.kind())) {
                continue;
            }
            if (seq >= MAX_EVENTS_PER_RUN) {
                log.debug("Run {} : chronologie pleine, événement {} gardé au seul dossier de preuve", run.getId(), event.kind());
                continue;
            }
            eventRepository.save(DeliveryRunEvent.builder()
                .run(run)
                .seq(++seq)
                .kind(event.kind())
                .tool(blankToNull(event.tool()))
                .text(clip(event.text()))
                .build());
        }
    }

    /** Qui agit : la règle pour ses décisions, le runner pour les sorties et le plafond, l'agent pour le reste. */
    private static MissionEvidenceService.Actor actorOf(DeliveryRun run, RunnerEventsRequest.Event event) {
        return switch (event.kind()) {
            case "decision" -> new MissionEvidenceService.Actor("rule", event.rule() == null || event.rule().isBlank() ? "none" : event.rule().strip());
            case "exit", "limit" -> new MissionEvidenceService.Actor("runner", run.getClaimedBy() == null ? "runner" : run.getClaimedBy());
            default -> new MissionEvidenceService.Actor("agent", run.getProviderKey());
        };
    }

    private static Map<String, Object> evidenceData(RunnerEventsRequest.Event event) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", event.kind());
        data.put("tool", blankToNull(event.tool()));
        data.put("text", clip(event.text()));
        if (event.effect() != null) data.put("effect", event.effect());
        if ("denied".equals(event.kind())) data.put("effect", "deny");
        if ("error".equals(event.kind())) data.put("ok", false);
        return data;
    }

    /** Ouvre une demande de validation et prévient la personne qui a délégué. */
    @Transactional
    public RunnerApprovalResponse openApproval(DeliveryRun run, String tool, String summary) {
        DeliveryRunApproval approval = approvalRepository.save(DeliveryRunApproval.builder()
            .run(run)
            .tool(tool.strip())
            .summary(clip(summary))
            .expiresAt(LocalDateTime.now().plus(settings.approvalTimeout()))
            .build());
        notificationService.notifyAgentApproval(run.getIssue(), run.getStartedBy(), approval.getTool(), approval.getSummary());
        Map<String, Object> asked = approvalData(approval);
        asked.put("effect", "ask");
        asked.put("asked", run.getStartedBy() != null ? run.getStartedBy().getEmail() : null);
        evidenceService.append(run, "action.decided", MissionEvidenceService.Actor.SERVER, asked);
        log.info("Run {} : validation {} demandée ({})", run.getId(), approval.getId(), approval.getTool());
        return toRunnerResponse(approval);
    }

    /** État d'une demande ; une demande restée sans réponse au-delà de son échéance passe EXPIRED ici. */
    @Transactional
    public RunnerApprovalResponse approvalStatus(DeliveryRun run, Long approvalId) {
        DeliveryRunApproval approval = approvalRepository.findByIdAndRunId(approvalId, run.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Approval request not found"));
        expireIfDue(approval, LocalDateTime.now());
        return toRunnerResponse(approval);
    }

    /** Run terminé : ses demandes encore ouvertes ne recevront plus de réponse utile, et le dossier le dit. */
    @Transactional
    public void closeApprovals(DeliveryRun run) {
        for (DeliveryRunApproval approval : approvalRepository.findByRunIdOrderByCreatedAtAsc(run.getId())) {
            if (approval.getStatus() == DeliveryApprovalStatus.PENDING) {
                recordUnanswered(run, approval, "The mission ended before an answer.");
            }
        }
        approvalRepository.expirePending(run.getId(), LocalDateTime.now(), DeliveryApprovalStatus.PENDING, DeliveryApprovalStatus.EXPIRED);
    }

    // --------------------------------------------------------------------- personne connectée

    /** Chronologie après {@code after} et demandes du run, si le projet est visible par cette personne. */
    @Transactional
    public DeliveryRunActivityResponse activity(String slug, Long runId, int after, Long userId) {
        DeliveryRun run = scopedRun(slug, runId);
        visibilityGuard.assertCanView(run.getIssue().getProject(), userId);
        LocalDateTime now = LocalDateTime.now();

        List<DeliveryRunActivityResponse.Event> events = eventRepository
            .findByRunIdAndSeqGreaterThanOrderBySeqAsc(runId, Math.max(after, 0), PageRequest.of(0, PAGE)).stream()
            .map(e -> new DeliveryRunActivityResponse.Event(e.getSeq(), e.getKind(), e.getTool(), e.getText(), e.getCreatedAt()))
            .toList();
        boolean delegator = run.getStartedBy() != null && Objects.equals(run.getStartedBy().getId(), userId);
        List<DeliveryRunActivityResponse.Approval> approvals = approvalRepository.findByRunIdOrderByCreatedAtAsc(runId).stream()
            .peek(a -> expireIfDue(a, now))
            .map(a -> new DeliveryRunActivityResponse.Approval(a.getId(), a.getTool(), a.getSummary(), a.getStatus().name(),
                a.getCreatedAt(), a.getExpiresAt(), a.getDecidedAt(), displayName(a.getDecidedBy()),
                delegator && a.getStatus() == DeliveryApprovalStatus.PENDING))
            .toList();
        return new DeliveryRunActivityResponse(events, approvals);
    }

    /** Le dossier de preuve du run, en JSON ou en Markdown, si le projet est visible ; vide pour un run de la v1. */
    @Transactional(readOnly = true)
    public Optional<String> dossier(String slug, Long runId, Long userId, boolean markdown) {
        DeliveryRun run = scopedRun(slug, runId);
        visibilityGuard.assertCanView(run.getIssue().getProject(), userId);
        return markdown ? evidenceService.dossierMarkdown(run) : evidenceService.dossierJson(run);
    }

    /** Autorise ou refuse une action de l'agent. Réservé à la personne qui a délégué, tant que la demande attend. */
    @Transactional
    public void decide(String slug, Long runId, Long approvalId, boolean allow, Long userId) {
        DeliveryRun run = scopedRun(slug, runId);
        visibilityGuard.assertCanView(run.getIssue().getProject(), userId);
        if (run.getStartedBy() == null || !Objects.equals(run.getStartedBy().getId(), userId)) {
            throw new ForbiddenException("Only the person who delegated this task can answer: the action runs on their machine.");
        }
        DeliveryRunApproval approval = approvalRepository.findByIdAndRunId(approvalId, runId)
            .orElseThrow(() -> new ResourceNotFoundException("Approval request not found"));
        LocalDateTime now = LocalDateTime.now();
        expireIfDue(approval, now);
        if (approval.getStatus() == DeliveryApprovalStatus.EXPIRED || run.getStatus() != DeliveryRunStatus.RUNNING) {
            throw new BusinessException("This request has expired: the agent already went on without it.");
        }
        if (approval.getStatus() != DeliveryApprovalStatus.PENDING) {
            throw new BusinessException("This request was already answered.");
        }
        approval.setStatus(allow ? DeliveryApprovalStatus.ALLOWED : DeliveryApprovalStatus.DENIED);
        approval.setDecidedAt(now);
        approval.setDecidedBy(userRepository.getReferenceById(userId));
        approvalRepository.save(approval);
        Map<String, Object> decided = approvalData(approval);
        decided.put("decision", approval.getStatus().name());
        evidenceService.append(run, "human.decision", new MissionEvidenceService.Actor("person", run.getStartedBy().getEmail()), decided);
        log.info("Run {} : validation {} {} par {}", runId, approvalId, approval.getStatus(), userId);
    }

    // ---------------------------------------------------------------------

    private void expireIfDue(DeliveryRunApproval approval, LocalDateTime now) {
        if (approval.getStatus() == DeliveryApprovalStatus.PENDING && !now.isBefore(approval.getExpiresAt())) {
            approval.setStatus(DeliveryApprovalStatus.EXPIRED);
            approvalRepository.save(approval);
            recordUnanswered(approval.getRun(), approval, "No answer in time.");
        }
    }

    /** Une demande restée sans réponse : refusée, et ce refus a pour auteur le serveur, pas une personne. */
    private void recordUnanswered(DeliveryRun run, DeliveryRunApproval approval, String reason) {
        Map<String, Object> data = approvalData(approval);
        data.put("effect", "deny");
        data.put("reason", reason);
        evidenceService.append(run, "action.decided", MissionEvidenceService.Actor.SERVER, data);
    }

    private static Map<String, Object> approvalData(DeliveryRunApproval approval) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("approval", approval.getId());
        data.put("tool", approval.getTool());
        data.put("summary", approval.getSummary());
        return data;
    }

    /** Run du workspace du chemin ; un run d'un autre workspace répond comme un run inexistant. */
    private DeliveryRun scopedRun(String slug, Long runId) {
        DeliveryRun run = runRepository.findById(runId)
            .orElseThrow(() -> new ResourceNotFoundException("Run not found"));
        var project = run.getIssue().getProject();
        if (project == null || project.getWorkspace() == null || !slug.equals(project.getWorkspace().getSlug())) {
            throw new ResourceNotFoundException("Run not found");
        }
        return run;
    }

    private static RunnerApprovalResponse toRunnerResponse(DeliveryRunApproval approval) {
        return new RunnerApprovalResponse(approval.getId(), approval.getStatus().name(), approval.getExpiresAt());
    }

    private static String displayName(User user) {
        if (user == null) return null;
        return user.getDisplayName() != null ? user.getDisplayName() : user.getEmail();
    }

    private static String clip(String text) {
        String value = text == null ? "" : text.strip();
        return value.length() > MAX_TEXT ? value.substring(0, MAX_TEXT - 3) + "..." : value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
