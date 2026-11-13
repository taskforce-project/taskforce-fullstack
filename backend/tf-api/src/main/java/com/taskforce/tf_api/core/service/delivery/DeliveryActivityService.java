package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.RunnerApprovalRequest;
import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryOpenApprovalResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.RunnerApprovalResponse;
import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.DeliveryRunApprovalSignature;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalSignatureRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.rules.RuleApprovers;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.NotificationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
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
    private final BrainAccessGuard access;
    private final NotificationService notificationService;
    private final LocalRunnerSettings settings;
    private final MissionEvidenceService evidenceService;
    private final HarnessRulesService rulesService;
    private final RuleApprovers approvers;
    private final DeliveryRunApprovalSignatureRepository signatureRepository;
    private final WorkspaceMemberRepository workspaceMembers;
    private final ProjectDeliveryFeed feed;

    /** Type de l'événement du dossier de preuve pour chaque sorte d'événement du runner. */
    private static final Map<String, String> EVIDENCE_TYPE = Map.of(
        "start", "note", "text", "note", "tool", "action.requested", "error", "action.result", "denied", "action.decided",
        "decision", "action.decided", "exit", "exit.result", "limit", "limit.reached", "test", "test.result");
    /** Les décisions des règles vont au dossier, pas à la chronologie affichée : une ligne par action la noierait. */
    private static final Set<String> EVIDENCE_ONLY = Set.of("decision");

    /** La portée d'un accord : une fois, ou pour le reste de la mission (R46). */
    public static final String SCOPE_ONCE = "ONCE";
    public static final String SCOPE_MISSION = "MISSION";
    /** Les règles du socle, que le moteur nomme {@code floor-…}. */
    private static final String FLOOR = "floor-";

    // --------------------------------------------------------------------- runner (autorité déjà vérifiée)

    /**
     * Ajoute des événements à la suite de la chronologie et du dossier de preuve ; le run est verrouillé par
     * l'appelant. La chronologie a son plafond d'affichage ; le dossier, le sien, plus haut, et le dit quand il est atteint.
     * Quand la chronologie avance, le topic du projet le dit, une fois par lot, avec la nouvelle étape en cours.
     */
    @Transactional
    public void appendEvents(DeliveryRun run, List<RunnerEventsRequest.Event> events) {
        int seq = eventRepository.maxSeq(run.getId());
        DeliveryRunEvent last = null;
        for (RunnerEventsRequest.Event event : events) {
            evidenceService.append(run, EVIDENCE_TYPE.getOrDefault(event.kind(), "note"), actorOf(run, event), evidenceData(event));
            if (EVIDENCE_ONLY.contains(event.kind())) {
                continue;
            }
            if (seq >= MAX_EVENTS_PER_RUN) {
                log.debug("Run {} : chronologie pleine, événement {} gardé au seul dossier de preuve", run.getId(), event.kind());
                continue;
            }
            last = eventRepository.save(DeliveryRunEvent.builder()
                .run(run)
                .seq(++seq)
                .kind(event.kind())
                .tool(blankToNull(event.tool()))
                .text(clip(event.text()))
                .build());
        }
        if (last != null) feed.step(run, last);
    }

    /** Qui agit : la règle pour ses décisions, le runner pour les sorties et le plafond, l'agent pour le reste. */
    private static MissionEvidenceService.Actor actorOf(DeliveryRun run, RunnerEventsRequest.Event event) {
        return switch (event.kind()) {
            case "decision" -> new MissionEvidenceService.Actor("rule", event.rule() == null || event.rule().isBlank() ? "none" : event.rule().strip());
            case "exit", "limit", "test" -> new MissionEvidenceService.Actor("runner", run.getClaimedBy() == null ? "runner" : run.getClaimedBy());
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

    /** Ouvre une demande de l'agent et prévient la personne qui a délégué. */
    @Transactional
    public RunnerApprovalResponse openApproval(DeliveryRun run, String tool, String summary) {
        return openApproval(run, tool, summary, false);
    }

    /**
     * Ouvre une demande de validation et prévient la personne qui a délégué. {@code byRunner} : c'est TaskForce qui
     * demande (sortie, tests, départ), pas l'agent, et la demande le dit (décision J4).
     */
    @Transactional
    public RunnerApprovalResponse openApproval(DeliveryRun run, String tool, String summary, boolean byRunner) {
        return openApproval(run, tool, summary, byRunner, null);
    }

    /**
     * Ouvre une demande avec ce que les règles ont jugé : l'action, la règle qui demande et sa raison, pour que la
     * demande se dise en mots (R78, séance n°13). {@code ruling} est nul pour un runner plus ancien.
     */
    @Transactional
    public RunnerApprovalResponse openApproval(DeliveryRun run, String tool, String summary, boolean byRunner,
                                               RunnerApprovalRequest ruling) {
        // Le serveur rejuge l'action avec les mêmes règles (R157) : ce qu'une règle de l'entreprise demande à l'accord
        // (R98), et un refus que le runner n'aurait pas vu, qui clôt la demande aussitôt.
        RulesBundle bundle = bundleOf(run);
        List<Map<String, String>> facts = factsOf(ruling);
        RulesEngine.Decision judged = facts == null ? null : RulesEngine.decideAll(bundle, facts);
        RulesEngine.Obligations require = judged == null ? ruleObligations(bundle, ruling) : judged.require();
        boolean refused = judged != null && RulesEngine.DENY.equals(judged.effect());
        DeliveryRunApproval approval = approvalRepository.save(DeliveryRunApproval.builder()
            .run(run)
            .tool(tool.strip())
            .summary(clip(summary))
            .askedBy(byRunner ? "runner" : "agent")
            .action(ruling == null ? null : blankToNull(ruling.action()))
            .ruleId(refused ? judged.rule().id() : ruling == null ? null : blankToNull(ruling.rule()))
            .ruleReason(refused ? clip(judged.rule().reason()) : ruling == null ? null : blankToNull(ruling.reason()))
            .status(refused ? DeliveryApprovalStatus.DENIED : DeliveryApprovalStatus.PENDING)
            .decidedAt(refused ? LocalDateTime.now() : null)
            .approvers(require == null || require.approvers().isEmpty() ? null : require.approvers())
            .signatures(require == null ? 1 : require.signatures())
            .separateRoles(require != null && require.separate())
            .binding(binds(bundle, facts, judged, require, ruling))
            .expiresAt(LocalDateTime.now().plus(settings.approvalTimeout()))
            .build());
        Map<String, Object> asked = approvalData(approval);
        asked.put("askedBy", approval.getAskedBy());
        asked.put("effect", refused ? "deny" : "ask");
        asked.put("asked", run.getStartedBy() != null ? run.getStartedBy().getEmail() : null);
        if (require != null) {
            asked.put("require", Map.of("approvers", require.approvers(), "signatures", require.signatures(),
                "separate", require.separate()));
        }
        evidenceService.append(run, "action.decided", MissionEvidenceService.Actor.SERVER, asked);
        if (!refused) {
            for (User signer : signers(run, approval.obligations())) {
                notificationService.notifyAgentApproval(run.getIssue(), signer, approval.getTool(), approval.getSummary(), byRunner);
            }
        }
        feed.approval(run, approval);
        log.info("Run {} : validation {} demandée ({}){}", run.getId(), approval.getId(), approval.getTool(),
            refused ? ", refusée par les règles du serveur" : "");
        return toRunnerResponse(approval);
    }

    /** Les faits que le runner a jugés, nettoyés, pour les rejuger ; null quand il ne les a pas envoyés (runner plus ancien). */
    private static List<Map<String, String>> factsOf(RunnerApprovalRequest ruling) {
        if (ruling == null || ruling.facts() == null || ruling.facts().isEmpty()) {
            return null;
        }
        List<Map<String, String>> facts = new ArrayList<>();
        for (Map<String, String> part : ruling.facts()) {
            Map<String, String> clean = new LinkedHashMap<>();
            if (part != null) {
                part.forEach((k, v) -> {
                    if (k != null && v != null) clean.put(k, v);
                });
            }
            // Ce que le runner demande, c'est un agent qui le fait : jugé comme tel, quoi que disent ses faits (R157).
            clean.put("actor", "agent");
            facts.add(clean);
        }
        return facts;
    }

    /**
     * La décision lie-t-elle ? Une couche de l'entreprise, une règle qui porte des obligations (qui accorde, combien de
     * signatures, un seuil) ou le socle, pour l'appel ou l'un de ses morceaux qui demandent : un accord n'y vaudra qu'une
     * fois. Sans les faits (runner plus ancien), la règle qu'il a nommée, d'après les règles en vigueur.
     */
    private static boolean binds(RulesBundle bundle, List<Map<String, String>> facts, RulesEngine.Decision judged,
                                 RulesEngine.Obligations require, RunnerApprovalRequest ruling) {
        if (!RuleApprovers.ordinary(require)) {
            return true;
        }
        if (judged != null) {
            if (binding(judged)) {
                return true;
            }
            for (Map<String, String> part : facts) {
                RulesEngine.Decision decision = RulesEngine.decide(bundle, part);
                if (RulesEngine.ASK.equals(decision.effect()) && binding(decision)) {
                    return true;
                }
            }
            return false;
        }
        String ruleId = ruling == null ? null : blankToNull(ruling.rule());
        if (ruleId == null) {
            return false;
        }
        return ruleId.startsWith(FLOOR) || bundle.rules().stream()
            .anyMatch(r -> ruleId.equals(r.id()) && (r.layer() != null || (r.when() != null && r.when().over() != null)));
    }

    /** Une décision qui lie : sa règle vient d'une couche de l'entreprise ou du socle, porte un seuil ou des obligations. */
    private static boolean binding(RulesEngine.Decision decision) {
        RulesBundle.Rule rule = decision.rule();
        return !RuleApprovers.ordinary(decision.require()) || (rule != null && (rule.layer() != null
            || rule.id().startsWith(FLOOR) || (rule.when() != null && rule.when().over() != null)));
    }

    /** Ce que demande la règle que le runner a nommée, d'après les règles en vigueur, quand il n'a pas envoyé ses faits. */
    private RulesEngine.Obligations ruleObligations(RulesBundle bundle, RunnerApprovalRequest ruling) {
        String ruleId = ruling == null ? null : blankToNull(ruling.rule());
        if (ruleId == null) {
            return null;
        }
        return bundle.rules().stream()
            .filter(r -> ruleId.equals(r.id()) && RulesEngine.ASK.equals(r.effect()) && r.require() != null)
            .findFirst()
            .map(r -> new RulesEngine.Obligations(
                r.require().approvers() == null || r.require().approvers().isEmpty() ? List.of() : List.of(r.require().approvers()),
                r.require().signatures() == null ? 1 : Math.max(1, r.require().signatures()),
                Boolean.TRUE.equals(r.require().separate())))
            .filter(o -> !o.addsNothing())
            .orElse(null);
    }

    private RulesBundle bundleOf(DeliveryRun run) {
        Project project = run.getIssue().getProject();
        return rulesService.bundleFor(project.getWorkspace(), new HarnessRulesService.Work(project.getId(), null,
            run.getStartedBy() == null ? null : run.getStartedBy().getId()));
    }

    /**
     * Les personnes qui peuvent signer un accord : la personne qui a délégué pour un accord ordinaire ; sinon les membres
     * de l'espace qui voient le projet et que l'accord désigne.
     */
    private List<User> signers(DeliveryRun run, RulesEngine.Obligations require) {
        if (RuleApprovers.ordinary(require)) {
            return run.getStartedBy() == null ? List.of() : List.of(run.getStartedBy());
        }
        Project project = run.getIssue().getProject();
        Long delegator = run.getStartedBy() == null ? null : run.getStartedBy().getId();
        return workspaceMembers.findByWorkspaceId(project.getWorkspace().getId()).stream()
            .map(WorkspaceMember::getUser)
            .filter(u -> visibilityGuard.canView(project, u.getId()))
            .filter(u -> approvers.maySign(require, project.getWorkspace().getId(), project.getId(), delegator, u.getId()))
            .toList();
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
        notificationService.readAgentApprovals(run.getIssue(), run.getStartedBy());
    }

    // --------------------------------------------------------------------- personne connectée

    /**
     * Ce qui attend vraiment la personne dans l'espace (R128, séance n°19), une ligne par mission : ses demandes encore
     * ouvertes, sur les projets qu'elle voit. La source de vérité est la demande, pas sa notification : rien ne marquait
     * lue une notification dont la demande était tranchée, échue ou orpheline.
     */
    @Transactional(readOnly = true)
    public List<DeliveryOpenApprovalResponse> openApprovals(String slug, Long userId) {
        Workspace workspace = access.resolveAndAuthorize(slug, userId);
        List<Long> projectIds = visibilityGuard.viewableProjectIds(workspace.getId(), userId);
        if (projectIds.isEmpty()) return List.of();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime aliveSince = now.minus(settings.heartbeatTimeout());
        Map<Long, DeliveryOpenApprovalResponse> rows = new LinkedHashMap<>();
        approvalRepository.findOpen(projectIds, userId, DeliveryApprovalStatus.PENDING, now,
                DeliveryRunStatus.RUNNING, aliveSince)
            .forEach(row -> rows.put(row.getRunId(), new DeliveryOpenApprovalResponse(row.getRunId(), row.getIssueId(),
                row.getSequenceNumber() == null ? null : row.getProjectIdentifier() + "-" + row.getSequenceNumber(),
                row.getIssueTitle(), row.getProjectId(), row.getRequests())));
        // Les accords qu'une règle de l'entreprise adresse à des personnes désignées (R98) : ceux que cette personne peut
        // encore signer.
        for (DeliveryRunApproval approval : approvalRepository.findOpenWithObligations(projectIds,
                DeliveryApprovalStatus.PENDING, now, DeliveryRunStatus.RUNNING, aliveSince)) {
            DeliveryRun run = approval.getRun();
            if (!canSign(run, approval, userId)) continue;
            Issue issue = run.getIssue();
            DeliveryOpenApprovalResponse current = rows.get(run.getId());
            long requests = current == null ? 1 : current.requests() + 1;
            rows.put(run.getId(), new DeliveryOpenApprovalResponse(run.getId(), issue.getId(),
                issue.getSequenceNumber() == null ? null : issue.getProject().getIdentifier() + "-" + issue.getSequenceNumber(),
                issue.getTitle(), issue.getProject().getId(), requests));
        }
        return List.copyOf(rows.values());
    }

    /** Cette personne peut-elle encore répondre à cette demande ? Elle doit pouvoir la signer, et ne pas l'avoir déjà fait. */
    private boolean canSign(DeliveryRun run, DeliveryRunApproval approval, Long userId) {
        if (approval.getStatus() != DeliveryApprovalStatus.PENDING) return false;
        RulesEngine.Obligations require = approval.obligations();
        Project project = run.getIssue().getProject();
        Long delegator = run.getStartedBy() == null ? null : run.getStartedBy().getId();
        if (!approvers.maySign(require, project.getWorkspace().getId(), project.getId(), delegator, userId)) return false;
        return RuleApprovers.ordinary(require) || !signatureRepository.existsByApprovalIdAndUserId(approval.getId(), userId);
    }

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
        List<DeliveryRunActivityResponse.Approval> approvals = approvalRepository.findByRunIdOrderByCreatedAtAsc(runId).stream()
            .peek(a -> expireIfDue(a, now))
            .map(a -> approvalView(run, a, userId))
            .toList();
        return new DeliveryRunActivityResponse(events, approvals);
    }

    /**
     * Les demandes encore ouvertes de ces missions, par mission (la vue du projet, R166), avec les champs de la chronologie :
     * {@code canDecide} pour cette personne, comme les règles de l'espace en décident ({@link RuleApprovers}). Une demande
     * échue passe EXPIRED ici, comme à la lecture de la chronologie. Seule une mission en cours a des demandes ouvertes ;
     * l'appelant a vérifié que la personne voit le projet de ces missions.
     */
    @Transactional
    public Map<Long, List<DeliveryRunActivityResponse.Approval>> pendingApprovals(Collection<DeliveryRun> runs, Long userId) {
        Map<Long, DeliveryRun> running = new LinkedHashMap<>();
        for (DeliveryRun run : runs) {
            if (run.getStatus() == DeliveryRunStatus.RUNNING) running.put(run.getId(), run);
        }
        if (running.isEmpty()) return Map.of();
        LocalDateTime now = LocalDateTime.now();
        Map<Long, List<DeliveryRunActivityResponse.Approval>> pending = new LinkedHashMap<>();
        for (DeliveryRunApproval approval : approvalRepository.findByRunIdInAndStatusOrderByCreatedAtAsc(running.keySet(),
                DeliveryApprovalStatus.PENDING)) {
            DeliveryRun run = running.get(approval.getRun().getId());
            if (run == null) continue;
            expireIfDue(approval, now);
            if (approval.getStatus() != DeliveryApprovalStatus.PENDING) continue;
            pending.computeIfAbsent(run.getId(), id -> new ArrayList<>()).add(approvalView(run, approval, userId));
        }
        return pending;
    }

    /**
     * Une demande telle que la chronologie et la vue du projet la montrent. {@code canDecide} : cette personne peut encore y
     * répondre, comme {@link #decide} l'accepterait.
     */
    private DeliveryRunActivityResponse.Approval approvalView(DeliveryRun run, DeliveryRunApproval a, Long userId) {
        Long workspaceId = run.getIssue().getProject().getWorkspace().getId();
        RulesEngine.Obligations require = a.obligations();
        List<String> signedBy = RuleApprovers.ordinary(require) ? List.of()
            : signatureRepository.findByApprovalIdOrderBySignedAtAsc(a.getId()).stream()
                .filter(DeliveryRunApprovalSignature::isAllow).map(s -> displayName(s.getUser())).toList();
        return new DeliveryRunActivityResponse.Approval(a.getId(), a.getTool(), a.getSummary(), a.getStatus().name(),
            a.getCreatedAt(), a.getExpiresAt(), a.getDecidedAt(), displayName(a.getDecidedBy()),
            canSign(run, a, userId), a.getAskedBy(), a.getAction(), a.getRuleId(), a.getRuleReason(), a.getScope(),
            approvers.labels(require, workspaceId), require == null ? 1 : require.signatures(),
            require != null && require.separate(), signedBy, a.isBinding());
    }

    /** Le dossier de preuve du run, en JSON ou en Markdown, si le projet est visible ; vide pour un run de la v1. */
    @Transactional(readOnly = true)
    public Optional<String> dossier(String slug, Long runId, Long userId, boolean markdown) {
        DeliveryRun run = scopedRun(slug, runId);
        visibilityGuard.assertCanView(run.getIssue().getProject(), userId);
        return markdown ? evidenceService.dossierMarkdown(run) : evidenceService.dossierJson(run);
    }

    /** Autorise une fois, ou refuse, une action de l'agent. */
    @Transactional
    public void decide(String slug, Long runId, Long approvalId, boolean allow, Long userId) {
        decide(slug, runId, approvalId, allow, false, userId);
    }

    /**
     * Autorise ou refuse une action de l'agent. Réservé à la personne qui a délégué, tant que la demande attend. Un accord
     * {@code forMission} vaut pour le reste de la mission (R46) : le runner ne redemande plus ce que la même règle demande.
     * Une décision qui lie (une couche de l'entreprise, des obligations, le socle) ne s'accorde qu'une fois.
     *
     * @return la portée enregistrée ({@link #SCOPE_ONCE} ou {@link #SCOPE_MISSION}), ou nul quand seule la signature est
     *     enregistrée et que la demande attend encore les autres personnes que la règle désigne
     */
    @Transactional
    public String decide(String slug, Long runId, Long approvalId, boolean allow, boolean forMission, Long userId) {
        DeliveryRun run = scopedRun(slug, runId);
        Project project = run.getIssue().getProject();
        visibilityGuard.assertCanView(project, userId);
        // La ligne de la demande, verrouillée : deux signatures qui arrivent ensemble se comptent l'une après l'autre.
        DeliveryRunApproval approval = approvalRepository.findByIdAndRunIdForUpdate(approvalId, runId)
            .orElseThrow(() -> new ResourceNotFoundException("Approval request not found"));
        RulesEngine.Obligations require = approval.obligations();
        Long delegator = run.getStartedBy() == null ? null : run.getStartedBy().getId();
        if (!approvers.maySign(require, project.getWorkspace().getId(), project.getId(), delegator, userId)) {
            throw new ForbiddenException(RuleApprovers.ordinary(require)
                ? "Only the person who delegated this task can answer: the action runs on their machine."
                : "Your workspace's rules ask other people to approve this request.");
        }
        LocalDateTime now = LocalDateTime.now();
        expireIfDue(approval, now);
        if (approval.getStatus() == DeliveryApprovalStatus.EXPIRED || run.getStatus() != DeliveryRunStatus.RUNNING) {
            throw new BusinessException("This request has expired: the agent already went on without it.");
        }
        if (approval.getStatus() != DeliveryApprovalStatus.PENDING) {
            throw new BusinessException("This request was already answered.");
        }
        User person = userRepository.getReferenceById(userId);
        if (!RuleApprovers.ordinary(require)) {
            // Une règle de l'entreprise (R98) : chaque personne signe une fois ; un refus suffit, l'accord vient quand les
            // signatures réunissent ce que la règle demande.
            if (signatureRepository.existsByApprovalIdAndUserId(approval.getId(), userId)) {
                throw new BusinessException("You already answered this request.");
            }
            signatureRepository.save(DeliveryRunApprovalSignature.builder()
                .approval(approval).user(person).allow(allow).signedAt(now).build());
            List<Long> allowed = signatureRepository.findByApprovalIdOrderBySignedAtAsc(approval.getId()).stream()
                .filter(DeliveryRunApprovalSignature::isAllow)
                .map(s -> s.getUser() == null ? null : s.getUser().getId())
                .toList();
            if (allow && !approvers.complete(require, project.getWorkspace().getId(), project.getId(), allowed)) {
                Map<String, Object> signed = approvalData(approval);
                signed.put("decision", "SIGNED");
                signed.put("signatures", allowed.size());
                evidenceService.append(run, "human.decision", personActor(run, userId), signed);
                // Une signature de plus : la demande attend encore, mais qui a signé et qui peut encore signer ont changé.
                feed.approval(run, approval);
                log.info("Run {} : validation {} signée par {} ({} sur {})", runId, approvalId, userId, allowed.size(),
                    require.signatures());
                return null;
            }
        }
        approval.setStatus(allow ? DeliveryApprovalStatus.ALLOWED : DeliveryApprovalStatus.DENIED);
        approval.setScope(allow && forMission && !approval.isBinding() ? SCOPE_MISSION : SCOPE_ONCE);
        approval.setDecidedAt(now);
        approval.setDecidedBy(person);
        approvalRepository.save(approval);
        readNotificationsIfSettled(run);
        for (User signer : signers(run, require)) {
            if (!Objects.equals(signer.getId(), delegator)) notificationService.readAgentApprovals(run.getIssue(), signer);
        }
        Map<String, Object> decided = approvalData(approval);
        decided.put("decision", approval.getStatus().name());
        decided.put("scope", approval.getScope());
        evidenceService.append(run, "human.decision", personActor(run, userId), decided);
        feed.approval(run, approval);
        log.info("Run {} : validation {} {} par {}", runId, approvalId, approval.getStatus(), userId);
        return approval.getScope();
    }

    /** La personne qui décide, telle que le dossier la nomme : son adresse, comme pour la personne qui a délégué. */
    private MissionEvidenceService.Actor personActor(DeliveryRun run, Long userId) {
        if (run.getStartedBy() != null && Objects.equals(run.getStartedBy().getId(), userId)) {
            return new MissionEvidenceService.Actor("person", run.getStartedBy().getEmail());
        }
        String email = userRepository.findById(userId).map(User::getEmail).orElse(String.valueOf(userId));
        return new MissionEvidenceService.Actor("person", email);
    }

    // ---------------------------------------------------------------------

    private void expireIfDue(DeliveryRunApproval approval, LocalDateTime now) {
        if (approval.getStatus() == DeliveryApprovalStatus.PENDING && !now.isBefore(approval.getExpiresAt())) {
            approval.setStatus(DeliveryApprovalStatus.EXPIRED);
            approvalRepository.save(approval);
            recordUnanswered(approval.getRun(), approval, "No answer in time.");
            readNotificationsIfSettled(approval.getRun());
            feed.approval(approval.getRun(), approval);
        }
    }

    /** La dernière demande ouverte du run vient de se clore : ses notifications d'accord ne restent pas non lues. */
    private void readNotificationsIfSettled(DeliveryRun run) {
        if (approvalRepository.countByRunIdAndStatus(run.getId(), DeliveryApprovalStatus.PENDING) == 0) {
            notificationService.readAgentApprovals(run.getIssue(), run.getStartedBy());
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
        if (approval.getAction() != null) data.put("action", approval.getAction());
        if (approval.getRuleId() != null) data.put("rule", approval.getRuleId());
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
        return new RunnerApprovalResponse(approval.getId(), approval.getStatus().name(), approval.getExpiresAt(), approval.getScope());
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
