package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.taskforce.tf_api.core.dto.request.RunnerChangesRequest;
import com.taskforce.tf_api.core.dto.request.RunnerCommandResultRequest;
import com.taskforce.tf_api.core.dto.response.MissionChangesResponse;
import com.taskforce.tf_api.core.dto.response.RunnerCommandResponse;
import com.taskforce.tf_api.core.enums.DeliveryCommandKind;
import com.taskforce.tf_api.core.enums.DeliveryCommandStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunOutcome;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunChange;
import com.taskforce.tf_api.core.model.DeliveryRunCommand;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunChangeRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunChangeRepository.Row;
import com.taskforce.tf_api.core.repository.DeliveryRunCommandRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

/**
 * Les changements sous les yeux (R139, séance n°20) : ce que le runner relève, ce qu'on en fait, et ce qui n'est pas
 * proposé (R15). Chaque geste entre au dossier de la mission.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("MissionChangesService")
class MissionChangesServiceTest {

    private static final String SLUG = "acme";
    private static final long RUN_ID = 100L;
    private static final long USER_ID = 7L;
    private static final String RUNNER_ID = "tf-runner-ada";
    private static final String BASE = "a".repeat(40);
    private static final RunnerIdentity RUNNER = new RunnerIdentity(RUNNER_ID, "ada@taskforce.dev");
    private static final RulesBundle RULES = new RulesBundle(RulesBundle.FORMAT, "acme", null, 3, "sha256:" + "a".repeat(64), null, List.of());

    @Mock private DeliveryRunRepository runRepository;
    @Mock private DeliveryRunChangeRepository changeRepository;
    @Mock private DeliveryRunCommandRepository commandRepository;
    @Mock private UserRepository userRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private MissionEvidenceService evidence;
    @Mock private RunnerPresenceService presence;
    @Mock private HarnessRulesService rulesService;

    private MissionChangesService service;
    private User ada;
    private Project project;

    @BeforeEach
    void setUp() {
        service = new MissionChangesService(runRepository, changeRepository, commandRepository, userRepository, visibilityGuard,
            evidence, presence, rulesService);
        ada = User.builder().id(USER_ID).email("ada@taskforce.dev").isActive(true).build();
        Workspace workspace = mock(Workspace.class);
        lenient().when(workspace.getSlug()).thenReturn(SLUG);
        project = mock(Project.class);
        lenient().when(project.getWorkspace()).thenReturn(workspace);
        lenient().when(project.getRepoFullName()).thenReturn("acme/website");
        lenient().when(visibilityGuard.canWrite(any(), anyLong())).thenReturn(true);
        lenient().when(presence.online(USER_ID, RUNNER_ID)).thenReturn(true);
        lenient().when(rulesService.bundleFor(any(), any())).thenReturn(RULES);
        lenient().when(userRepository.getReferenceById(USER_ID)).thenReturn(ada);
        lenient().when(userRepository.findByEmail("ada@taskforce.dev")).thenReturn(Optional.of(ada));
        lenient().when(commandRepository.save(any())).thenAnswer(i -> {
            DeliveryRunCommand command = i.getArgument(0);
            if (command.getId() == null) command.setId(55L);
            return command;
        });
    }

    /** Une mission finie, en attente de relecture, sur une branche. */
    private DeliveryRun doneRun() {
        Issue issue = mock(Issue.class);
        lenient().when(issue.getProject()).thenReturn(project);
        DeliveryRun run = DeliveryRun.builder()
            .id(RUN_ID).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.DONE).claimedBy(RUNNER_ID)
            .startedBy(ada).branch("tf/web-1-r100").baseSha(BASE).workMode("repo").build();
        lenient().when(runRepository.findById(RUN_ID)).thenReturn(Optional.of(run));
        lenient().when(runRepository.findByIdForUpdate(RUN_ID)).thenReturn(Optional.of(run));
        return run;
    }

    private static Row row(long id, String path, int added, int removed, String revision) {
        return new Row(id, path, "modified", added, removed, false, false, false, revision, LocalDateTime.now());
    }

    private static RunnerChangesRequest.File file(String path, String revision, String body) {
        return new RunnerChangesRequest.File(path, "modified", 2, 1, false, false, false, revision, body);
    }

    private static RunnerChangesRequest snapshot(boolean isFinal, RunnerChangesRequest.File... files) {
        return new RunnerChangesRequest("repo", BASE, List.of(files), 0, 2, 1, isFinal);
    }

    private DeliveryRunCommand command(DeliveryCommandKind kind, DeliveryCommandStatus status, DeliveryRun run, String path) {
        return DeliveryRunCommand.builder().id(9L).run(run).kind(kind).path(path).status(status)
            .createdAt(LocalDateTime.now()).takenAt(LocalDateTime.now()).build();
    }

    // ---------------------------------------------------------------- le relevé du runner

    @Test
    @DisplayName("le relevé : un fichier neuf, un fichier changé, un texte gardé, un fichier parti")
    void saves_a_snapshot() {
        DeliveryRun run = doneRun();
        run.setStatus(DeliveryRunStatus.RUNNING);
        run.setWorkMode(null);
        run.setBaseSha(null);
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of(
            row(1, "same.txt", 2, 1, "r1"), row(2, "moved.txt", 2, 1, "r1"), row(3, "cleared.txt", 2, 1, "r1"), row(4, "gone.txt", 2, 1, "r1")));
        DeliveryRunChange moved = DeliveryRunChange.builder().path("moved.txt").body("old").revision("r1").build();
        DeliveryRunChange cleared = DeliveryRunChange.builder().path("cleared.txt").body("old").revision("r1").build();
        when(changeRepository.getReferenceById(2L)).thenReturn(moved);
        when(changeRepository.getReferenceById(3L)).thenReturn(cleared);

        service.saveChanges(RUN_ID, RUNNER, snapshot(false, file("same.txt", "r1", null), file("moved.txt", "r2", "new text"),
            file("cleared.txt", "r2", null), file("new.txt", "r1", "brand\u0000new")));

        assertThat(run.getWorkMode()).isEqualTo("repo");
        assertThat(run.getBaseSha()).isEqualTo(BASE);
        assertThat(moved.getBody()).isEqualTo("new text");
        assertThat(cleared.getBody()).isNull();
        ArgumentCaptor<DeliveryRunChange> saved = ArgumentCaptor.forClass(DeliveryRunChange.class);
        verify(changeRepository, times(3)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(DeliveryRunChange::getPath).containsExactlyInAnyOrder("moved.txt", "cleared.txt", "new.txt");
        assertThat(saved.getAllValues().stream().filter(c -> c.getPath().equals("new.txt")).findFirst().orElseThrow().getBody())
            .isEqualTo("brandnew"); // PostgreSQL refuse un caractère nul dans un TEXT
        verify(changeRepository).deleteByRunIdAndPathIn(RUN_ID, Set.of("gone.txt"));
        verify(evidence, never()).append(any(), any(), any(), any());
    }

    @Test
    @DisplayName("l'état final entre au dossier : chaque fichier, ses lignes, son empreinte, jamais son texte")
    void final_snapshot_goes_to_the_record() {
        DeliveryRun run = doneRun();
        run.setStatus(DeliveryRunStatus.RUNNING);
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of());

        service.saveChanges(RUN_ID, RUNNER, snapshot(true, file("a.txt", "r1", "SECRET TEXT")));

        ArgumentCaptor<Map<String, Object>> data = dataCaptor();
        verify(evidence).append(eq(run), eq("note"), eq(new MissionEvidenceService.Actor("runner", RUNNER_ID)), data.capture());
        assertThat(data.getValue()).containsEntry("kind", "changes").containsEntry("added", 2L).containsEntry("removed", 1L);
        assertThat(data.getValue().toString()).contains("a.txt", "r1").doesNotContain("SECRET TEXT");
    }

    static Stream<Arguments> not_held() {
        return Stream.of(
            Arguments.of("un autre runner", (java.util.function.Consumer<DeliveryRun>) run -> run.setClaimedBy("tf-runner-eve")),
            Arguments.of("une mission finie", (java.util.function.Consumer<DeliveryRun>) run -> run.setStatus(DeliveryRunStatus.DONE)),
            Arguments.of("une autre personne", (java.util.function.Consumer<DeliveryRun>) run -> run.setStartedBy(User.builder().id(8L).email("eve@x.dev").isActive(true).build())));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("not_held")
    @DisplayName("le relevé est refusé hors du run tenu par ce runner")
    void snapshot_refused(String label, java.util.function.Consumer<DeliveryRun> change) {
        DeliveryRun run = doneRun();
        run.setStatus(DeliveryRunStatus.RUNNING);
        change.accept(run);

        assertThatThrownBy(() -> service.saveChanges(RUN_ID, RUNNER, snapshot(false))).isInstanceOf(ForbiddenException.class);
        verify(changeRepository, never()).listRows(anyLong());
    }

    // ---------------------------------------------------------------- ce que la personne voit et peut faire

    @Test
    @DisplayName("la liste : les totaux, le fichier en cours de retour, la raison d'un échec, la dernière tentative qui compte")
    void lists_the_files() {
        DeliveryRun run = doneRun();
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of(
            row(1, "a.txt", 12, 1, "r1"), row(2, "b.txt", 3, 0, "r1"), row(3, "c.txt", 0, 4, "r1"), row(4, "logo.png", 0, 0, "r1")));
        DeliveryRunCommand running = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.RUNNING, run, "a.txt");
        DeliveryRunCommand failed = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.FAILED, run, "b.txt");
        failed.setMessage("TaskForce didn't put this file back: no.");
        DeliveryRunCommand olderFailure = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.FAILED, run, "c.txt");
        olderFailure.setMessage("an old failure");
        DeliveryRunCommand newerDone = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.DONE, run, "c.txt");
        when(commandRepository.findTop50ByRunIdOrderByIdDesc(RUN_ID)).thenReturn(List.of(running, failed, newerDone, olderFailure));

        MissionChangesResponse response = service.changes(SLUG, RUN_ID, USER_ID);

        assertThat(response.mode()).isEqualTo("repo");
        assertThat(response.live()).isFalse();
        assertThat(response.added()).isEqualTo(15);
        assertThat(response.removed()).isEqualTo(5);
        assertThat(response.files().get(0).reverting()).isTrue();
        assertThat(response.files().get(1).error()).contains("didn't put this file back");
        assertThat(response.files().get(2).error()).isNull();
        assertThat(response.canRevert()).isTrue();
        assertThat(response.canComment()).isTrue();
        verify(visibilityGuard).assertCanView(project, USER_ID);
    }

    record GateCase(String label, java.util.function.Consumer<DeliveryRun> change, long viewer, boolean online, boolean allowed, String why) {
        @Override
        public String toString() {
            return label;
        }
    }

    static Stream<GateCase> gates() {
        return Stream.of(
            new GateCase("une mission finie, à relire", run -> { }, USER_ID, true, true, null),
            new GateCase("elle travaille encore : rien à remettre", run -> run.setStatus(DeliveryRunStatus.RUNNING), USER_ID, true, false, null),
            new GateCase("elle a échoué", run -> run.setStatus(DeliveryRunStatus.FAILED), USER_ID, true, false, null),
            new GateCase("le résultat est tranché", run -> run.setOutcome(DeliveryRunOutcome.APPLIED), USER_ID, true, false, null),
            new GateCase("un dossier jetable n'a pas d'avant", run -> run.setWorkMode("scratch"), USER_ID, true, false, null),
            new GateCase("sans branche", run -> run.setBranch(null), USER_ID, true, false, null),
            new GateCase("sans point de départ", run -> run.setBaseSha(null), USER_ID, true, false, null),
            new GateCase("une autre personne regarde", run -> { }, 8L, true, false, null),
            new GateCase("la branche a disparu : on dit pourquoi", run -> run.setBranchGone(true), USER_ID, true, false, MissionChangesService.BRANCH_GONE),
            new GateCase("le poste n'est pas là : on dit quoi faire", run -> { }, USER_ID, false, false, MissionChangesService.RUNNER_OFFLINE));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gates")
    @DisplayName("ce qui n'est pas possible n'est pas proposé (R15)")
    void gate(GateCase c) {
        DeliveryRun run = doneRun();
        c.change().accept(run);
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of());
        when(presence.online(c.viewer(), RUNNER_ID)).thenReturn(c.online());
        when(presence.online(USER_ID, RUNNER_ID)).thenReturn(c.online());

        MissionChangesResponse response = service.changes(SLUG, RUN_ID, c.viewer());

        assertThat(response.canRevert()).isEqualTo(c.allowed());
        assertThat(response.canComment()).isEqualTo(c.allowed());
        assertThat(response.blockedReason()).isEqualTo(c.why());
    }

    @Test
    @DisplayName("la lecture seule d'un projet : rien à proposer, sans explication")
    void read_only_viewer() {
        doneRun();
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of());
        when(visibilityGuard.canWrite(project, USER_ID)).thenReturn(false);

        MissionChangesResponse response = service.changes(SLUG, RUN_ID, USER_ID);

        assertThat(response.canRevert()).isFalse();
        assertThat(response.blockedReason()).isNull();
    }

    @Test
    @DisplayName("pendant le travail : la correction est possible pour qui a délégué, si le runner sait la passer")
    void correction_offered_while_running() {
        DeliveryRun run = doneRun();
        run.setStatus(DeliveryRunStatus.RUNNING);
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of());
        assertThat(service.changes(SLUG, RUN_ID, USER_ID).canCorrect()).isTrue();
        assertThat(service.changes(SLUG, RUN_ID, 8L).canCorrect()).isFalse();
        run.setWorkMode(null);
        assertThat(service.changes(SLUG, RUN_ID, USER_ID).canCorrect()).isFalse();
    }

    @Test
    @DisplayName("une mission d'un autre workspace répond comme une mission inexistante")
    void other_workspace() {
        doneRun();
        assertThatThrownBy(() -> service.changes("other", RUN_ID, USER_ID)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("le texte d'un fichier : un diff, ou un contenu dans un dossier jetable")
    void reads_a_file() {
        DeliveryRun run = doneRun();
        when(changeRepository.findByRunIdAndPath(RUN_ID, "a.txt")).thenReturn(Optional.of(
            DeliveryRunChange.builder().path("a.txt").body("@@ -1 +1 @@").revision("r1").build()));
        assertThat(service.file(SLUG, RUN_ID, "a.txt", USER_ID).format()).isEqualTo("diff");
        run.setWorkMode("scratch");
        assertThat(service.file(SLUG, RUN_ID, "a.txt", USER_ID).format()).isEqualTo("text");
        verify(visibilityGuard, times(2)).assertCanView(project, USER_ID);
        assertThatThrownBy(() -> service.file(SLUG, RUN_ID, "nope.txt", USER_ID)).isInstanceOf(ResourceNotFoundException.class);
    }

    // ---------------------------------------------------------------- remettre un fichier

    @Test
    @DisplayName("remettre un fichier : un ordre pour le runner, et la décision de la personne au dossier")
    void revert_creates_a_command() {
        DeliveryRun run = doneRun();
        when(changeRepository.existsByRunIdAndPath(RUN_ID, "a.txt")).thenReturn(true);

        service.revert(SLUG, RUN_ID, "a.txt", USER_ID);

        ArgumentCaptor<DeliveryRunCommand> saved = ArgumentCaptor.forClass(DeliveryRunCommand.class);
        verify(commandRepository).save(saved.capture());
        assertThat(saved.getValue().getKind()).isEqualTo(DeliveryCommandKind.REVERT_FILE);
        assertThat(saved.getValue().getPath()).isEqualTo("a.txt");
        assertThat(saved.getValue().getStatus()).isEqualTo(DeliveryCommandStatus.PENDING);
        ArgumentCaptor<Map<String, Object>> data = dataCaptor();
        verify(evidence).appendAfterEnd(eq(run), eq("human.decision"), eq(new MissionEvidenceService.Actor("person", "ada@taskforce.dev")), data.capture());
        assertThat(data.getValue()).containsEntry("decision", "REVERT_FILE").containsEntry("path", "a.txt");
        verify(visibilityGuard).assertCanWrite(project, USER_ID);
    }

    @Test
    @DisplayName("redemander un fichier déjà en cours ne fait rien")
    void revert_is_idempotent() {
        doneRun();
        when(changeRepository.existsByRunIdAndPath(RUN_ID, "a.txt")).thenReturn(true);
        when(commandRepository.existsByRunIdAndPathAndStatusIn(eq(RUN_ID), eq("a.txt"), anyCollection())).thenReturn(true);

        service.revert(SLUG, RUN_ID, "a.txt", USER_ID);

        verify(commandRepository, never()).save(any());
    }

    @Test
    @DisplayName("seuls les fichiers de la mission se remettent")
    void revert_refuses_a_foreign_path() {
        doneRun();
        assertThatThrownBy(() -> service.revert(SLUG, RUN_ID, "../secret", USER_ID))
            .isInstanceOf(BusinessException.class).hasMessageContaining("not among the mission's changes");
        verify(commandRepository, never()).save(any());
    }

    @Test
    @DisplayName("seule la personne qui a délégué remet un fichier")
    void revert_refuses_someone_else() {
        doneRun();
        assertThatThrownBy(() -> service.revert(SLUG, RUN_ID, "a.txt", 8L)).isInstanceOf(ForbiddenException.class);
    }

    static Stream<Arguments> refused_reverts() {
        return Stream.of(
            Arguments.of("branche disparue", (java.util.function.Consumer<DeliveryRun>) run -> run.setBranchGone(true), "no longer on your computer"),
            Arguments.of("résultat tranché", (java.util.function.Consumer<DeliveryRun>) run -> run.setOutcome(DeliveryRunOutcome.APPLIED), "no longer under review"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("refused_reverts")
    @DisplayName("un geste refusé dit pourquoi")
    void revert_refused(String label, java.util.function.Consumer<DeliveryRun> change, String message) {
        DeliveryRun run = doneRun();
        change.accept(run);
        assertThatThrownBy(() -> service.revert(SLUG, RUN_ID, "a.txt", USER_ID)).isInstanceOf(BusinessException.class).hasMessageContaining(message);
    }

    // ---------------------------------------------------------------- une correction

    @Test
    @DisplayName("une correction pendant le travail : un ordre, et sa trace")
    void correction_is_recorded() {
        DeliveryRun run = doneRun();
        run.setStatus(DeliveryRunStatus.RUNNING);

        service.correct(SLUG, RUN_ID, "  use tabs  ", USER_ID);

        ArgumentCaptor<DeliveryRunCommand> saved = ArgumentCaptor.forClass(DeliveryRunCommand.class);
        verify(commandRepository).save(saved.capture());
        assertThat(saved.getValue().getText()).isEqualTo("use tabs");
        ArgumentCaptor<Map<String, Object>> data = dataCaptor();
        verify(evidence).append(eq(run), eq("human.decision"), any(), data.capture());
        assertThat(data.getValue()).containsEntry("decision", "CORRECTION").containsEntry("text", "use tabs");
    }

    @Test
    @DisplayName("une correction à une mission finie est refusée, avec sa raison")
    void correction_refused_when_finished() {
        doneRun();
        assertThatThrownBy(() -> service.correct(SLUG, RUN_ID, "x", USER_ID)).isInstanceOf(BusinessException.class).hasMessageContaining("isn't working any more");
    }

    @Test
    @DisplayName("une correction par quelqu'un d'autre est refusée")
    void correction_refused_for_someone_else() {
        DeliveryRun run = doneRun();
        run.setStatus(DeliveryRunStatus.RUNNING);
        assertThatThrownBy(() -> service.correct(SLUG, RUN_ID, "x", 8L)).isInstanceOf(ForbiddenException.class);
    }

    // ---------------------------------------------------------------- les ordres du runner

    @Test
    @DisplayName("le runner prend ses ordres : une fois chacun, avec la branche, le point de départ, les règles et le premier run")
    void hands_out_commands() {
        DeliveryRun root = doneRun();
        Issue issue = root.getIssue();
        DeliveryRun followUp = DeliveryRun.builder().id(200L).issue(issue).parentRun(root).branch("tf/web-1-r100").baseSha(BASE).build();
        DeliveryRunCommand revert = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.PENDING, followUp, "a.txt");
        DeliveryRunCommand lost = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.PENDING, followUp, "b.txt");
        lost.setId(10L);
        when(commandRepository.findPending(eq(DeliveryCommandStatus.PENDING), eq(RUNNER_ID), eq(USER_ID), any())).thenReturn(List.of(revert, lost));
        when(commandRepository.take(eq(9L), any(), eq(DeliveryCommandStatus.PENDING), eq(DeliveryCommandStatus.RUNNING))).thenReturn(1);
        when(commandRepository.take(eq(10L), any(), eq(DeliveryCommandStatus.PENDING), eq(DeliveryCommandStatus.RUNNING))).thenReturn(0);

        List<RunnerCommandResponse> out = service.takeCommands(RUNNER);

        assertThat(out).hasSize(1);
        RunnerCommandResponse response = out.get(0);
        assertThat(response.commandId()).isEqualTo(9L);
        assertThat(response.kind()).isEqualTo("REVERT_FILE");
        assertThat(response.branch()).isEqualTo("tf/web-1-r100");
        assertThat(response.base()).isEqualTo(BASE);
        assertThat(response.worktreeRun()).isEqualTo(RUN_ID);
        assertThat(response.repoFullName()).isEqualTo("acme/website");
        assertThat(response.rules()).isEqualTo(RULES);
        verify(presence).seen(USER_ID, RUNNER_ID);
    }

    @Test
    @DisplayName("un compte inconnu ou désactivé ne reçoit rien")
    void commands_refused_for_inactive_owner() {
        when(userRepository.findByEmail("ada@taskforce.dev")).thenReturn(Optional.of(User.builder().id(USER_ID).email("ada@taskforce.dev").isActive(false).build()));
        assertThatThrownBy(() -> service.takeCommands(RUNNER)).isInstanceOf(ForbiddenException.class);
    }

    private static RunnerChangesRequest afterRevert() {
        return new RunnerChangesRequest("repo", BASE, List.of(file("b.txt", "r9", "x")), 0, 1, 0, true);
    }

    @Test
    @DisplayName("un fichier remis : la liste se met à jour, les tests sont signalés dépassés, et tout entre au dossier")
    void finishes_a_revert() {
        DeliveryRun run = doneRun();
        run.setTestsRan(true);
        run.setTestsPassed(true);
        run.setCommits(1);
        DeliveryRunCommand command = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.RUNNING, run, "a.txt");
        when(commandRepository.findById(9L)).thenReturn(Optional.of(command));
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of(row(1, "a.txt", 2, 1, "r1")));
        var trace = List.of(new RunnerCommandResultRequest.Trace("file.write", "allow", "write-sandbox-files"),
            new RunnerCommandResultRequest.Trace("git.push", "allow", "push-agent-branch-private"));

        service.finishCommand(9L, RUNNER, new RunnerCommandResultRequest(true, "Put a.txt back.", null, "b".repeat(40), 2, true, trace, afterRevert()));

        assertThat(command.getStatus()).isEqualTo(DeliveryCommandStatus.DONE);
        assertThat(command.getMessage()).isEqualTo("Put a.txt back.");
        assertThat(run.getCommits()).isEqualTo(2);
        assertThat(run.isTestsStale()).isTrue();
        verify(changeRepository).deleteByRunIdAndPathIn(RUN_ID, Set.of("a.txt"));
        verify(evidence).appendAfterEnd(eq(run), eq("action.decided"), eq(new MissionEvidenceService.Actor("rule", "write-sandbox-files")), any());
        verify(evidence).appendAfterEnd(eq(run), eq("action.decided"), eq(new MissionEvidenceService.Actor("rule", "push-agent-branch-private")), any());
        ArgumentCaptor<Map<String, Object>> result = dataCaptor();
        verify(evidence).appendAfterEnd(eq(run), eq("action.result"), eq(new MissionEvidenceService.Actor("runner", RUNNER_ID)), result.capture());
        assertThat(result.getValue()).containsEntry("path", "a.txt").containsEntry("ok", true).containsEntry("pushed", true);
        verify(evidence).appendAfterEnd(eq(run), eq("note"), any(), any());
    }

    @Test
    @DisplayName("un fichier déjà comme avant : pas de commit, les tests restent valables")
    void revert_without_commit_keeps_tests() {
        DeliveryRun run = doneRun();
        run.setTestsRan(true);
        when(commandRepository.findById(9L)).thenReturn(Optional.of(command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.RUNNING, run, "a.txt")));
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of());

        service.finishCommand(9L, RUNNER, new RunnerCommandResultRequest(true, "Already.", null, null, 1, false, null, afterRevert()));

        assertThat(run.isTestsStale()).isFalse();
    }

    @Test
    @DisplayName("un retour qui échoue : la liste ne bouge pas, la raison se garde, la trace aussi")
    void failed_revert() {
        DeliveryRun run = doneRun();
        DeliveryRunCommand command = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.RUNNING, run, "a.txt");
        when(commandRepository.findById(9L)).thenReturn(Optional.of(command));

        service.finishCommand(9L, RUNNER, new RunnerCommandResultRequest(false, "TaskForce didn't put this file back: no.", null, null, null, null, null, null, "git checkout failed (code 128)"));

        assertThat(command.getStatus()).isEqualTo(DeliveryCommandStatus.FAILED);
        assertThat(command.getMessage()).isEqualTo("TaskForce didn't put this file back: no.");
        assertThat(run.isBranchGone()).isFalse();
        verify(changeRepository, never()).listRows(anyLong());
        // Le détail technique va au dossier, jamais à l'écran (R133).
        ArgumentCaptor<Map<String, Object>> data = dataCaptor();
        verify(evidence).appendAfterEnd(eq(run), eq("action.result"), any(), data.capture());
        assertThat(data.getValue()).containsEntry("detail", "git checkout failed (code 128)");
    }

    @Test
    @DisplayName("une branche disparue : la mission le retient, l'action s'efface")
    void gone_branch() {
        DeliveryRun run = doneRun();
        when(commandRepository.findById(9L)).thenReturn(Optional.of(command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.RUNNING, run, "a.txt")));

        service.finishCommand(9L, RUNNER, new RunnerCommandResultRequest(false, "gone", true, null, null, null, null, null));

        assertThat(run.isBranchGone()).isTrue();
    }

    @Test
    @DisplayName("une correction passée : sa trace, sans autre effet")
    void finishes_a_correction() {
        DeliveryRun run = doneRun();
        DeliveryRunCommand command = command(DeliveryCommandKind.CORRECTION, DeliveryCommandStatus.RUNNING, run, null);
        when(commandRepository.findById(9L)).thenReturn(Optional.of(command));

        service.finishCommand(9L, RUNNER, new RunnerCommandResultRequest(true, "Read at the next step.", null, null, null, null, null, null));

        assertThat(command.getStatus()).isEqualTo(DeliveryCommandStatus.DONE);
        ArgumentCaptor<Map<String, Object>> data = dataCaptor();
        verify(evidence).append(eq(run), eq("note"), any(), data.capture());
        assertThat(data.getValue()).containsEntry("kind", "correction").containsEntry("delivered", true);
    }

    @Test
    @DisplayName("une seconde réponse ne change rien")
    void second_answer_is_ignored() {
        DeliveryRun run = doneRun();
        DeliveryRunCommand command = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.DONE, run, "a.txt");
        when(commandRepository.findById(9L)).thenReturn(Optional.of(command));

        service.finishCommand(9L, RUNNER, new RunnerCommandResultRequest(false, "late", null, null, null, null, null, null));

        assertThat(command.getStatus()).isEqualTo(DeliveryCommandStatus.DONE);
        verify(evidence, never()).appendAfterEnd(any(), any(), any(), any());
    }

    @Test
    @DisplayName("le résultat d'un ordre d'un autre runner est refusé")
    void foreign_runner_cannot_finish() {
        DeliveryRun run = doneRun();
        run.setClaimedBy("tf-runner-eve");
        when(commandRepository.findById(9L)).thenReturn(Optional.of(command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.RUNNING, run, "a.txt")));

        assertThatThrownBy(() -> service.finishCommand(9L, RUNNER, new RunnerCommandResultRequest(true, "x", null, null, null, null, null, null)))
            .isInstanceOf(ForbiddenException.class);
    }

    static Stream<Arguments> stale_commands() {
        return Stream.of(
            Arguments.of(DeliveryCommandStatus.PENDING, DeliveryCommandStatus.EXPIRED, MissionChangesService.NOT_ANSWERED),
            Arguments.of(DeliveryCommandStatus.RUNNING, DeliveryCommandStatus.FAILED, MissionChangesService.NOT_FINISHED));
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @MethodSource("stale_commands")
    @DisplayName("un ordre resté sans réponse se clôt, et la personne lit quoi faire")
    void stale_commands_close(DeliveryCommandStatus before, DeliveryCommandStatus after, String message) {
        DeliveryRun run = doneRun();
        DeliveryRunCommand command = command(DeliveryCommandKind.REVERT_FILE, before, run, "a.txt");
        command.setCreatedAt(LocalDateTime.now().minusMinutes(10));
        command.setTakenAt(LocalDateTime.now().minusMinutes(10));
        when(commandRepository.findTop50ByRunIdOrderByIdDesc(RUN_ID)).thenReturn(new ArrayList<>(List.of(command)));
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of(row(1, "a.txt", 1, 0, "r1")));

        MissionChangesResponse response = service.changes(SLUG, RUN_ID, USER_ID);

        assertThat(command.getStatus()).isEqualTo(after);
        assertThat(response.files().get(0).reverting()).isFalse();
        assertThat(response.files().get(0).error()).isEqualTo(message);
        verify(evidence).appendAfterEnd(eq(run), eq("action.result"), eq(MissionEvidenceService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("la dernière correction se lit à côté de la liste, seulement pour qui l'a tapée")
    void last_correction() {
        DeliveryRun run = doneRun();
        run.setStatus(DeliveryRunStatus.RUNNING);
        DeliveryRunCommand first = command(DeliveryCommandKind.CORRECTION, DeliveryCommandStatus.DONE, run, null);
        first.setText("use tabs");
        first.setMessage("The agent reads it at its next step.");
        when(commandRepository.findTop50ByRunIdOrderByIdDesc(RUN_ID)).thenReturn(List.of(first));
        when(changeRepository.listRows(RUN_ID)).thenReturn(List.of());

        assertThat(service.changes(SLUG, RUN_ID, USER_ID).correction().text()).isEqualTo("use tabs");
        assertThat(service.changes(SLUG, RUN_ID, 8L).correction()).isNull();
    }

    @Test
    @DisplayName("un ordre en cours retient le résultat ; un ordre périmé non")
    void busy_while_a_command_is_active() {
        DeliveryRun run = doneRun();
        DeliveryRunCommand active = command(DeliveryCommandKind.REVERT_FILE, DeliveryCommandStatus.PENDING, run, "a.txt");
        when(commandRepository.findTop50ByRunIdOrderByIdDesc(RUN_ID)).thenReturn(List.of(active));
        assertThat(service.busy(RUN_ID)).isTrue();
        active.setCreatedAt(LocalDateTime.now().minusMinutes(10));
        assertThat(service.busy(RUN_ID)).isFalse();
    }

    @Test
    @DisplayName("les commentaires portent sur des fichiers de la mission")
    void comments_must_be_on_mission_files() {
        DeliveryRun run = doneRun();
        when(changeRepository.existsByRunIdAndPath(RUN_ID, "a.txt")).thenReturn(true);
        service.assertCanAskForChanges(run, USER_ID, Set.of("a.txt"));
        assertThatThrownBy(() -> service.assertCanAskForChanges(run, USER_ID, Set.of("a.txt", "b.txt")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("b.txt");
        run.setBranchGone(true);
        assertThatThrownBy(() -> service.assertCanAskForChanges(run, USER_ID, Set.of("a.txt")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("no longer on your computer");
        run.setBranchGone(false);
        run.setWorkMode("scratch");
        assertThatThrownBy(() -> service.assertCanAskForChanges(run, USER_ID, Set.of("a.txt")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("can't take comments");
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<Map<String, Object>> dataCaptor() {
        return ArgumentCaptor.forClass((Class<Map<String, Object>>) (Class<?>) Map.class);
    }
}
