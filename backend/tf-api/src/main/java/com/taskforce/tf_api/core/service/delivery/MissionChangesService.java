package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.RunnerChangesRequest;
import com.taskforce.tf_api.core.dto.request.RunnerCommandResultRequest;
import com.taskforce.tf_api.core.dto.response.MissionChangesResponse;
import com.taskforce.tf_api.core.dto.response.MissionFileChangeResponse;
import com.taskforce.tf_api.core.dto.response.RunnerCommandResponse;
import com.taskforce.tf_api.core.enums.DeliveryCommandKind;
import com.taskforce.tf_api.core.enums.DeliveryCommandStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunChange;
import com.taskforce.tf_api.core.model.DeliveryRunCommand;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.DeliveryRunChangeRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunCommandRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Les changements d'une mission sous les yeux (R139, séance n°20), et ce qu'on en fait : ce que le runner a relevé, un
 * fichier remis comme avant, une correction passée à l'agent pendant son travail (R140).
 *
 * <p>Le backend ne joint pas un poste local : un geste devient un ordre, que le runner vient chercher. Chaque geste entre
 * au dossier de preuve de la mission, à la suite de sa chaîne, et aucun ne lève une règle : le runner juge l'ordre avec
 * les règles de la mission avant que rien ne bouge. Ce qui n'est pas possible n'est pas proposé (R15).</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MissionChangesService {

    /** Un ordre que le runner n'a pas pris, ou n'a pas fini, dans ce délai est clos : la personne le lit. */
    static final Duration COMMAND_TTL = Duration.ofMinutes(5);
    static final String REFUSED = "Invalid delegation session";

    static final String BRANCH_GONE = "This mission's branch is no longer on your computer or on GitHub, so its files can't be put back from here.";
    static final String RUNNER_OFFLINE = "Open TaskForce on the computer that ran this mission to put files back or ask for changes.";
    static final String NOT_ANSWERED = "Your computer didn't answer. Check that TaskForce is open on it, then try again.";
    static final String NOT_FINISHED = "Your computer stopped before finishing. Try again.";
    private static final Set<DeliveryCommandStatus> ACTIVE = Set.of(DeliveryCommandStatus.PENDING, DeliveryCommandStatus.RUNNING);

    private final DeliveryRunRepository runRepository;
    private final DeliveryRunChangeRepository changeRepository;
    private final DeliveryRunCommandRepository commandRepository;
    private final UserRepository userRepository;
    private final ProjectVisibilityGuard visibilityGuard;
    private final MissionEvidenceService evidenceService;
    private final RunnerPresenceService presence;
    private final HarnessRulesService rulesService;

    // --------------------------------------------------------------------- personne connectée

    /** Les fichiers de la mission, et ce que cette personne peut en faire maintenant. */
    @Transactional
    public MissionChangesResponse changes(String slug, Long runId, Long userId) {
        DeliveryRun run = scopedRun(slug, runId);
        Project project = run.getIssue().getProject();
        visibilityGuard.assertCanView(project, userId);
        LocalDateTime now = LocalDateTime.now();
        List<DeliveryRunCommand> commands = commandRepository.findTop50ByRunIdOrderByIdDesc(runId);
        commands.forEach(command -> closeIfDue(command, now));

        Set<String> reverting = new HashSet<>();
        Map<String, String> failures = new HashMap<>();
        Set<String> settled = new HashSet<>();
        MissionChangesResponse.Correction correction = null;
        for (DeliveryRunCommand command : commands) {
            if (command.getKind() == DeliveryCommandKind.CORRECTION) {
                if (correction == null) correction = new MissionChangesResponse.Correction(command.getId(), command.getText(), command.getStatus().name(), command.getMessage());
                continue;
            }
            // Du plus récent au plus ancien : seule la dernière tentative sur un fichier dit où il en est.
            if (!settled.add(command.getPath())) continue;
            if (ACTIVE.contains(command.getStatus())) reverting.add(command.getPath());
            else if (command.getStatus() != DeliveryCommandStatus.DONE) failures.put(command.getPath(), command.getMessage());
        }
        long added = 0;
        long removed = 0;
        List<MissionChangesResponse.File> files = new ArrayList<>();
        for (DeliveryRunChangeRepository.Row row : changeRepository.listRows(runId)) {
            added += row.added() == null ? 0 : row.added();
            removed += row.removed() == null ? 0 : row.removed();
            files.add(new MissionChangesResponse.File(row.path(), row.status(), row.added(), row.removed(), row.binary(),
                row.truncated(), row.withheld(), row.revision(), reverting.contains(row.path()), failures.get(row.path()), row.updatedAt()));
        }
        Gate gate = gate(run, userId, visibilityGuard.canWrite(project, userId));
        boolean delegator = delegatedBy(run, userId);
        return new MissionChangesResponse(run.getWorkMode(), run.getStatus() == DeliveryRunStatus.RUNNING, added, removed,
            run.getChangesMore(), files, gate.allowed(), gate.allowed(),
            run.getStatus() == DeliveryRunStatus.RUNNING && delegator && run.getWorkMode() != null,
            gate.why(), delegator ? correction : null);
    }

    /** Le patch ou le contenu d'un fichier de la mission. */
    @Transactional(readOnly = true)
    public MissionFileChangeResponse file(String slug, Long runId, String path, Long userId) {
        DeliveryRun run = scopedRun(slug, runId);
        visibilityGuard.assertCanView(run.getIssue().getProject(), userId);
        DeliveryRunChange change = changeRepository.findByRunIdAndPath(runId, path)
            .orElseThrow(() -> new ResourceNotFoundException("This file is not among the mission's changes."));
        return new MissionFileChangeResponse(change.getPath(), "scratch".equals(run.getWorkMode()) ? "text" : "diff", change.getBody(),
            change.isBinary(), change.isTruncated(), change.isWithheld(), change.getRevision());
    }

    /**
     * Remet un fichier comme avant la mission (R139) : un ordre pour le runner qui l'a portée, qui le fait sur sa branche.
     * Seule la personne qui a délégué, tant que le résultat n'est pas tranché. Redemander un fichier déjà en cours ne fait rien.
     */
    @Transactional
    public void revert(String slug, Long runId, String path, Long userId) {
        DeliveryRun run = lockedRun(slug, runId);
        Project project = run.getIssue().getProject();
        visibilityGuard.assertCanWrite(project, userId);
        Gate gate = gate(run, userId, true);
        if (!gate.allowed()) {
            if (!delegatedBy(run, userId)) throw new ForbiddenException("Only the person who delegated this task can put its files back.");
            throw new BusinessException(gate.why() != null ? gate.why() : "This file can't be put back now: the mission is no longer under review.");
        }
        if (!changeRepository.existsByRunIdAndPath(runId, path)) {
            throw new BusinessException("This file is not among the mission's changes.");
        }
        if (commandRepository.existsByRunIdAndPathAndStatusIn(runId, path, ACTIVE)) return;
        User person = userRepository.getReferenceById(userId);
        DeliveryRunCommand command = commandRepository.save(DeliveryRunCommand.builder()
            .run(run).kind(DeliveryCommandKind.REVERT_FILE).path(path).requestedBy(person).createdAt(LocalDateTime.now()).build());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("decision", "REVERT_FILE");
        data.put("path", path);
        data.put("command", command.getId());
        evidenceService.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", run.getStartedBy().getEmail()), data);
        log.info("Run {} : retour en arrière demandé sur {} par {}", runId, path, userId);
    }

    /** Une correction tapée pendant le travail : l'agent la lit à sa prochaine étape (R140). */
    @Transactional
    public void correct(String slug, Long runId, String text, Long userId) {
        DeliveryRun run = lockedRun(slug, runId);
        visibilityGuard.assertCanWrite(run.getIssue().getProject(), userId);
        if (!delegatedBy(run, userId)) throw new ForbiddenException("Only the person who delegated this task can correct its agent.");
        if (run.getStatus() != DeliveryRunStatus.RUNNING || run.getWorkMode() == null) {
            throw new BusinessException("The agent isn't working any more, so it can't read a correction.");
        }
        DeliveryRunCommand command = commandRepository.save(DeliveryRunCommand.builder()
            .run(run).kind(DeliveryCommandKind.CORRECTION).text(text.strip()).requestedBy(userRepository.getReferenceById(userId))
            .createdAt(LocalDateTime.now()).build());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("decision", "CORRECTION");
        data.put("text", command.getText());
        data.put("command", command.getId());
        evidenceService.append(run, "human.decision", new MissionEvidenceService.Actor("person", run.getStartedBy().getEmail()), data);
    }

    /** Vrai si un ordre attend ou tourne encore : le résultat ne se tranche pas sous ses pieds. */
    @Transactional(readOnly = true)
    public boolean busy(Long runId) {
        LocalDateTime now = LocalDateTime.now();
        return commandRepository.findTop50ByRunIdOrderByIdDesc(runId).stream()
            .anyMatch(command -> ACTIVE.contains(command.getStatus()) && !isDue(command, now));
    }

    /** Les commentaires d'une relecture portent sur des fichiers de la mission, et la personne peut les envoyer maintenant. */
    @Transactional(readOnly = true)
    public void assertCanAskForChanges(DeliveryRun run, Long userId, Set<String> paths) {
        Gate gate = gate(run, userId, true);
        if (!gate.allowed()) {
            throw new BusinessException(gate.why() != null ? gate.why() : "The agent can't take comments on this mission.");
        }
        for (String path : paths) {
            if (!changeRepository.existsByRunIdAndPath(run.getId(), path)) {
                throw new BusinessException("A comment is on a file that is no longer among the mission's changes: " + path);
            }
        }
    }

    // --------------------------------------------------------------------- runner

    /** Le relevé de ce que la mission a changé, pendant qu'elle tourne. */
    @Transactional
    public void saveChanges(Long runId, RunnerIdentity runner, RunnerChangesRequest request) {
        DeliveryRun run = runRepository.findByIdForUpdate(runId).orElseThrow(() -> new ForbiddenException(REFUSED));
        LocalRunnerService.assertHeldBy(run, runner);
        apply(run, request);
        if (request.final_()) {
            evidenceService.append(run, "note", runnerActor(run), snapshotData(request));
        }
    }

    /** Les ordres qui attendent ce runner : chacun n'est remis qu'une fois. */
    @Transactional
    public List<RunnerCommandResponse> takeCommands(RunnerIdentity runner) {
        User owner = userRepository.findByEmail(runner.ownerEmail())
            .filter(user -> Boolean.TRUE.equals(user.getIsActive()))
            .orElseThrow(() -> new ForbiddenException(REFUSED));
        presence.seen(owner.getId(), runner.clientId());
        LocalDateTime now = LocalDateTime.now();
        List<RunnerCommandResponse> out = new ArrayList<>();
        for (DeliveryRunCommand command : commandRepository.findPending(DeliveryCommandStatus.PENDING, runner.clientId(), owner.getId(), PageRequest.of(0, 5))) {
            if (commandRepository.take(command.getId(), now, DeliveryCommandStatus.PENDING, DeliveryCommandStatus.RUNNING) == 1) {
                out.add(toRunner(command));
            }
        }
        return out;
    }

    /** Ce que le runner a fait d'un ordre, qui entre au dossier de la mission. Une seconde réponse ne change rien. */
    @Transactional
    public void finishCommand(Long commandId, RunnerIdentity runner, RunnerCommandResultRequest result) {
        DeliveryRunCommand command = commandRepository.findById(commandId).orElseThrow(() -> new ForbiddenException(REFUSED));
        DeliveryRun run = runRepository.findByIdForUpdate(command.getRun().getId()).orElseThrow(() -> new ForbiddenException(REFUSED));
        LocalRunnerService.assertCarriedBy(run, runner);
        if (command.getStatus() != DeliveryCommandStatus.RUNNING) return;
        command.setStatus(result.ok() ? DeliveryCommandStatus.DONE : DeliveryCommandStatus.FAILED);
        command.setMessage(result.message());
        command.setEndedAt(LocalDateTime.now());
        commandRepository.save(command);
        if (command.getKind() == DeliveryCommandKind.CORRECTION) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("kind", "correction");
            data.put("delivered", result.ok());
            data.put("command", command.getId());
            evidenceService.append(run, "note", runnerActor(run), data);
            return;
        }
        finishRevert(run, command, result);
    }

    private void finishRevert(DeliveryRun run, DeliveryRunCommand command, RunnerCommandResultRequest result) {
        if (Boolean.TRUE.equals(result.gone())) run.setBranchGone(true);
        if (result.trace() != null) {
            for (RunnerCommandResultRequest.Trace trace : result.trace()) {
                Map<String, Object> decided = new LinkedHashMap<>();
                decided.put("kind", "revert");
                decided.put("action", trace.action());
                decided.put("effect", trace.effect());
                decided.put("path", command.getPath());
                evidenceService.appendAfterEnd(run, "action.decided",
                    new MissionEvidenceService.Actor("rule", trace.rule() == null || trace.rule().isBlank() ? "none" : trace.rule()), decided);
            }
        }
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("kind", "revert");
        done.put("path", command.getPath());
        done.put("ok", result.ok());
        done.put("text", result.message());
        done.put("commit", result.commit());
        done.put("pushed", Boolean.TRUE.equals(result.pushed()));
        if (result.detail() != null) done.put("detail", result.detail());
        evidenceService.appendAfterEnd(run, "action.result", runnerActor(run), done);
        if (!result.ok() || result.changes() == null) return;
        apply(run, result.changes());
        evidenceService.appendAfterEnd(run, "note", runnerActor(run), snapshotData(result.changes()));
        if (result.commits() != null) run.setCommits(result.commits());
        // Les tests ont tourné sur une version qui n'existe plus : la carte de résultat le dit, sans rien inventer.
        if (result.commit() != null && Boolean.TRUE.equals(run.getTestsRan())) run.setTestsStale(true);
        runRepository.save(run);
    }

    // ---------------------------------------------------------------------

    /** Remplace la liste des fichiers par ce relevé ; un texte qui n'a pas changé reste où il est. */
    private void apply(DeliveryRun run, RunnerChangesRequest request) {
        run.setWorkMode(request.mode());
        if (request.base() != null) run.setBaseSha(request.base());
        run.setChangesMore(request.more());
        Map<String, DeliveryRunChangeRepository.Row> known = new HashMap<>();
        for (DeliveryRunChangeRepository.Row row : changeRepository.listRows(run.getId())) known.put(row.path(), row);
        LocalDateTime now = LocalDateTime.now();
        for (RunnerChangesRequest.File file : request.files()) {
            DeliveryRunChangeRepository.Row row = known.remove(file.path());
            if (row != null && unchanged(row, file) && file.body() == null) continue;
            DeliveryRunChange change = row == null
                ? DeliveryRunChange.builder().run(run).path(file.path()).build()
                : changeRepository.getReferenceById(row.id());
            boolean sameText = row != null && row.revision().equals(file.revision());
            change.setStatus(file.status());
            change.setAdded(file.added());
            change.setRemoved(file.removed());
            change.setBinary(file.binary());
            change.setTruncated(file.truncated());
            change.setWithheld(file.withheld());
            change.setRevision(file.revision());
            if (file.body() != null) change.setBody(file.body().replace("\u0000", ""));
            else if (!sameText) change.setBody(null);
            change.setUpdatedAt(now);
            changeRepository.save(change);
        }
        if (!known.isEmpty()) changeRepository.deleteByRunIdAndPathIn(run.getId(), known.keySet());
    }

    private static boolean unchanged(DeliveryRunChangeRepository.Row row, RunnerChangesRequest.File file) {
        return row.revision().equals(file.revision()) && row.status().equals(file.status())
            && Objects.equals(row.added(), file.added()) && Objects.equals(row.removed(), file.removed())
            && row.binary() == file.binary() && row.truncated() == file.truncated() && row.withheld() == file.withheld();
    }

    /** Ce que le dossier garde d'un relevé : chaque fichier, ses lignes et son empreinte, jamais son texte. */
    private static Map<String, Object> snapshotData(RunnerChangesRequest request) {
        List<Map<String, Object>> files = new ArrayList<>();
        for (RunnerChangesRequest.File file : request.files()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("path", file.path());
            entry.put("status", file.status());
            entry.put("added", file.added());
            entry.put("removed", file.removed());
            entry.put("revision", file.revision());
            files.add(entry);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", "changes");
        data.put("mode", request.mode());
        data.put("base", request.base());
        data.put("added", request.added());
        data.put("removed", request.removed());
        data.put("more", request.more());
        data.put("files", files);
        return data;
    }

    private RunnerCommandResponse toRunner(DeliveryRunCommand command) {
        DeliveryRun run = command.getRun();
        Project project = run.getIssue().getProject();
        DeliveryRun root = run;
        while (root.getParentRun() != null) root = root.getParentRun();
        boolean revert = command.getKind() == DeliveryCommandKind.REVERT_FILE;
        return new RunnerCommandResponse(command.getId(), run.getId(), command.getKind().name(), command.getPath(),
            revert ? run.getBranch() : null, revert ? run.getBaseSha() : null, revert ? root.getId() : null,
            revert ? project.getRepoFullName() : null, revert ? rulesService.bundleFor(project.getWorkspace()) : null, command.getText());
    }

    /** Ce que la personne peut faire du résultat maintenant ; sans raison quand il n'y a rien à lui expliquer. */
    private record Gate(boolean allowed, String why) {
        static final Gate NO = new Gate(false, null);
    }

    private Gate gate(DeliveryRun run, Long userId, boolean canWrite) {
        if (run.getStatus() != DeliveryRunStatus.DONE || run.getOutcome() != null) return Gate.NO;
        if (!"repo".equals(run.getWorkMode()) || run.getBranch() == null || run.getBaseSha() == null) return Gate.NO;
        if (!delegatedBy(run, userId) || !canWrite) return Gate.NO;
        if (run.isBranchGone()) return new Gate(false, BRANCH_GONE);
        if (!presence.online(userId, run.getClaimedBy())) return new Gate(false, RUNNER_OFFLINE);
        return new Gate(true, null);
    }

    private static boolean delegatedBy(DeliveryRun run, Long userId) {
        return run.getStartedBy() != null && Objects.equals(run.getStartedBy().getId(), userId);
    }

    private static boolean isDue(DeliveryRunCommand command, LocalDateTime now) {
        LocalDateTime since = command.getStatus() == DeliveryCommandStatus.RUNNING && command.getTakenAt() != null ? command.getTakenAt() : command.getCreatedAt();
        return since.plus(COMMAND_TTL).isBefore(now);
    }

    /** Un ordre resté sans réponse se clôt, avec une phrase et une trace au dossier : la personne n'attend pas pour rien. */
    private void closeIfDue(DeliveryRunCommand command, LocalDateTime now) {
        if (!ACTIVE.contains(command.getStatus()) || !isDue(command, now)) return;
        boolean taken = command.getStatus() == DeliveryCommandStatus.RUNNING;
        command.setStatus(taken ? DeliveryCommandStatus.FAILED : DeliveryCommandStatus.EXPIRED);
        command.setMessage(taken ? NOT_FINISHED : NOT_ANSWERED);
        command.setEndedAt(now);
        commandRepository.save(command);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", command.getKind() == DeliveryCommandKind.REVERT_FILE ? "revert" : "correction");
        data.put("path", command.getPath());
        data.put("ok", false);
        data.put("text", command.getMessage());
        evidenceService.appendAfterEnd(command.getRun(), "action.result", MissionEvidenceService.Actor.SERVER, data);
    }

    private static MissionEvidenceService.Actor runnerActor(DeliveryRun run) {
        return new MissionEvidenceService.Actor("runner", run.getClaimedBy() == null ? "runner" : run.getClaimedBy());
    }

    private DeliveryRun scopedRun(String slug, Long runId) {
        return inWorkspace(slug, runRepository.findById(runId));
    }

    private DeliveryRun lockedRun(String slug, Long runId) {
        return inWorkspace(slug, runRepository.findByIdForUpdate(runId));
    }

    /** Une mission d'un autre workspace répond comme une mission inexistante. */
    private static DeliveryRun inWorkspace(String slug, Optional<DeliveryRun> found) {
        DeliveryRun run = found.orElseThrow(() -> new ResourceNotFoundException("Run not found"));
        Project project = run.getIssue().getProject();
        if (project == null || project.getWorkspace() == null || !slug.equals(project.getWorkspace().getSlug())) {
            throw new ResourceNotFoundException("Run not found");
        }
        return run;
    }
}
