package com.taskforce.tf_api.core.service.mcpserver;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.AddIssueToCycleRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.dto.response.IssueCommentResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.delivery.DeliveryActivityService;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProvider;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProviderRegistry;
import com.taskforce.tf_api.core.service.delivery.DeliveryRunner;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Les gestes sur une issue du MCP TaskForce (ADR-024, TF-J1-5) : l'issue nommée par sa clé, ses champs changés par leurs
 * noms comme sur la carte de Cortex, ce qui se défait (R77), et la mission qu'on lit sans rien décider (R1).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Gestes sur une issue du MCP TaskForce")
class IssueGesturesTest {

    @Mock private IssueService issueService;
    @Mock private ProjectService projectService;
    @Mock private CycleService cycleService;
    @Mock private WorkspaceRepository workspaces;
    @Mock private ProjectRepository projects;
    @Mock private IssueRepository issues;
    @Mock private ProjectVisibilityGuard visibility;
    @Mock private DeliveryService deliveryService;
    @Mock private DeliveryRunner deliveryRunner;
    @Mock private DeliveryActivityService activityService;
    @Mock private DeliveryAgentProviderRegistry providers;

    private final ObjectMapper json = new ObjectMapper();
    private IssueGestures gestures;

    private static final Long ME = 7L;
    private static final Project PROJECT = Project.builder().id(12L).identifier("TF").name("TaskForce").build();
    private static final IssueStatusResponse BACKLOG = column(1L, "Backlog", IssueStatusCategory.BACKLOG);
    private static final IssueStatusResponse TODO = column(2L, "Todo", IssueStatusCategory.UNSTARTED);
    private static final IssueStatusResponse DOING = column(3L, "In Progress", IssueStatusCategory.STARTED);
    private static final ProjectLabelResponse BUG = ProjectLabelResponse.builder().id(40L).name("bug").build();
    private static final ProjectLabelResponse UI = ProjectLabelResponse.builder().id(41L).name("ui").build();
    private static final ProjectMemberResponse PIERRE = ProjectMemberResponse.builder().userId(ME).email("pierre@acme.test")
        .displayName("Pierre Michel").build();
    private static final ProjectMemberResponse ADA = ProjectMemberResponse.builder().userId(8L).email("ada@acme.test")
        .displayName("Ada Lovelace").build();
    private static final CycleResponse SPRINT_1 = CycleResponse.builder().id(70L).name("Sprint 1").status(CycleStatus.ACTIVE).build();
    private static final CycleResponse SPRINT_2 = CycleResponse.builder().id(71L).name("Sprint 2").status(CycleStatus.DRAFT).build();

    @BeforeEach
    void setUp() {
        gestures = new IssueGestures(issueService, projectService, cycleService, workspaces, projects, issues, visibility,
            deliveryService, deliveryRunner, activityService, providers);
        Workspace ws = Workspace.builder().id(1L).slug("acme").name("Acme").build();
        lenient().when(workspaces.findBySlug("acme")).thenReturn(Optional.of(ws));
        lenient().when(projects.findByIdAndWorkspaceId(12L, 1L)).thenReturn(Optional.of(PROJECT));
        lenient().when(projectService.getProject("acme", 12L, ME))
            .thenReturn(ProjectResponse.builder().id(12L).identifier("TF").name("TaskForce").build());
        lenient().when(issueService.listStatuses("acme", 12L, ME)).thenReturn(List.of(BACKLOG, TODO, DOING));
        lenient().when(projectService.listMembers("acme", 12L, ME)).thenReturn(List.of(PIERRE, ADA));
        lenient().when(projectService.listLabels("acme", 12L, ME)).thenReturn(List.of(BUG, UI));
        lenient().when(cycleService.listCycles("acme", 12L, ME)).thenReturn(List.of(SPRINT_1, SPRINT_2));
    }

    private static IssueStatusResponse column(Long id, String name, IssueStatusCategory category) {
        return IssueStatusResponse.builder().id(id).name(name).category(category).isDefault(id == 1L).build();
    }

    /** TF-12 « Fix login » : dans Todo, sans assigné, avec le label ui, sans points ni échéance, dans le Sprint 1. */
    private IssueResponse.IssueResponseBuilder issue() {
        return IssueResponse.builder().id(5L).projectId(12L).identifier("TF-12").title("Fix login").description("Old")
            .priority(IssuePriority.MEDIUM).status(TODO).labels(List.of(UI));
    }

    private void stubIssue(IssueResponse.IssueResponseBuilder built) {
        IssueResponse issue = built.build();
        lenient().when(issueService.getIssue("acme", 12L, 5L, ME)).thenReturn(issue);
        lenient().when(issueService.updateIssue(eq("acme"), eq(12L), eq(5L), any(UpdateIssueRequest.class), eq(ME)))
            .thenReturn(issue);
        lenient().when(cycleService.listCyclesForIssue("acme", 12L, 5L, ME)).thenReturn(List.of(SPRINT_1));
    }

    private JsonNode args(String body) throws Exception {
        return json.readTree(body);
    }

    private UpdateIssueRequest sent() {
        ArgumentCaptor<UpdateIssueRequest> request = ArgumentCaptor.forClass(UpdateIssueRequest.class);
        verify(issueService).updateIssue(eq("acme"), eq(12L), eq(5L), request.capture(), eq(ME));
        return request.getValue();
    }

    // ------------------------------------------------------------------ l'issue par sa clé

    /** La clé d'un projet peut porter des tirets et des chiffres : le numéro suit le dernier tiret (« HR-1372-12 »). */
    @ParameterizedTest(name = "« {0} » est l'issue 12 du projet {1}")
    @CsvSource({"TF-12, TF", "tf-12, TF", "' TF-12 ', TF", "HR-1372-12, HR-1372", "2026-Q4-12, 2026-Q4"})
    void the_key_the_person_reads_gives_the_ids(String key, String project) throws Exception {
        when(projects.findByWorkspaceIdAndIdentifier(1L, project)).thenReturn(Optional.of(PROJECT));
        when(visibility.canView(PROJECT, ME)).thenReturn(true);
        when(issues.findByProjectIdAndSequenceNumber(12L, 12)).thenReturn(Optional.of(Issue.builder().id(5L).build()));

        JsonNode resolved = gestures.withIds("acme", ME, args("{\"issue\": \"" + key + "\", \"status\": \"Done\"}"));

        assertThat(resolved.path("projectId").asLong()).isEqualTo(12L);
        assertThat(resolved.path("issueId").asLong()).isEqualTo(5L);
        assertThat(resolved.path("status").asText()).isEqualTo("Done");
    }

    @Test
    @DisplayName("un projet privé qu'on ne voit pas répond comme une clé qui n'existe pas")
    void a_private_project_answers_like_a_missing_key() throws Exception {
        when(projects.findByWorkspaceIdAndIdentifier(1L, "TF")).thenReturn(Optional.of(PROJECT));
        when(visibility.canView(PROJECT, ME)).thenReturn(false);

        assertThatThrownBy(() -> gestures.withIds("acme", ME, args("{\"issue\": \"TF-12\"}")))
            .hasMessage("There is no issue TF-12 in this workspace: check its key.");
        verify(issues, never()).findByProjectIdAndSequenceNumber(anyLong(), any());
    }

    @Test
    void a_malformed_key_says_the_form_it_needs() {
        assertThatThrownBy(() -> gestures.withIds("acme", ME, args("{\"issue\": \"the login bug\"}")))
            .hasMessageContaining("issue must be the issue's key, like TF-12");
    }

    @Test
    void ids_passed_win_and_nothing_is_read() throws Exception {
        JsonNode given = args("{\"issue\": \"TF-99\", \"projectId\": 12, \"issueId\": 5}");

        assertThat(gestures.withIds("acme", ME, given)).isSameAs(given);
        verify(workspaces, never()).findBySlug(any());
    }

    // ------------------------------------------------------------------ changer, déplacer, assigner

    @Test
    @DisplayName("les champs se nomment comme sur le tableau : « to do », « moi », un label, un cycle")
    void fields_are_named_as_on_the_board() throws Exception {
        stubIssue(issue());
        String due = LocalDate.now(ZoneOffset.UTC).plusDays(10).toString();

        IssueGestures.Gesture gesture = gestures.update("acme", ME, args("{\"projectId\": 12, \"issueId\": 5, "
            + "\"status\": \"in progress\", \"assignee\": \"moi\", \"priority\": \"high\", \"addLabels\": [\"bug\"], "
            + "\"removeLabels\": [\"ui\"], \"points\": 3, \"cycle\": \"sprint 2\", \"dueDate\": \"" + due + "\"}"));

        UpdateIssueRequest request = sent();
        assertThat(request.getStatusId()).isEqualTo(3L);
        assertThat(request.getAssigneeId()).isEqualTo(ME);
        assertThat(request.getPriority()).isEqualTo(IssuePriority.HIGH);
        assertThat(request.getLabelIds()).containsExactly(40L);
        assertThat(request.getStoryPoints()).isEqualTo(3);
        assertThat(request.getDueDate()).isEqualTo(due);
        // Le cycle : l'issue quitte le Sprint 1 pour le Sprint 2.
        verify(cycleService).removeIssueFromCycle("acme", 12L, 70L, 5L, ME);
        ArgumentCaptor<AddIssueToCycleRequest> added = ArgumentCaptor.forClass(AddIssueToCycleRequest.class);
        verify(cycleService).addIssueToCycle(eq("acme"), eq(12L), eq(71L), added.capture(), eq(ME));
        assertThat(added.getValue().getIssueId()).isEqualTo(5L);

        assertThat(gesture.summary()).startsWith("Updated TF-12 \"Fix login\": ")
            .contains("column from Todo to In Progress", "assignee from nobody to Pierre Michel", "labels from ui to bug",
                "cycle from Sprint 1 to Sprint 2");
        assertThat(gesture.issue()).containsEntry("issueId", 5L).containsEntry("key", "TF-12").doesNotContainKey("runId");
        // De quoi remettre chaque champ : l'ancienne valeur, et celle que Cortex a mise.
        JsonNode undo = json.valueToTree(gesture.undo());
        assertThat(undo.path("fields").path("status").path("from").asLong()).isEqualTo(2L);
        assertThat(undo.path("fields").path("assignee").path("from").isNull()).isTrue();
        assertThat(undo.path("fields").path("cycles").path("to").get(0).asLong()).isEqualTo(71L);
        // Un client MCP lit la phrase, l'issue et les changements, jamais de quoi défaire.
        assertThat(gesture.forClient()).containsKeys("summary", "issue", "changes").doesNotContainKey("undo");
    }

    @ParameterizedTest(name = "« none » retire {0}")
    @CsvSource(delimiter = '|', value = {
        "assignee | {\"assignee\": \"none\"}",
        "dueDate  | {\"dueDate\": \"none\"}",
        "points   | {\"points\": 0}",
        "cycle    | {\"cycle\": \"nobody\"}",
    })
    void none_removes_a_value(String field, String body) throws Exception {
        stubIssue(issue().assignee(UserSummaryResponse.builder().id(8L).displayName("Ada Lovelace").build())
            .dueDate(LocalDate.of(2026, 12, 1)).storyPoints(5));
        String withIds = body.replace("{", "{\"projectId\": 12, \"issueId\": 5, ");

        IssueGestures.Gesture gesture = gestures.update("acme", ME, args(withIds));

        assertThat(gesture.changes()).hasSize(1);
        switch (field) {
            case "assignee" -> assertThat(sent().getUnassign()).isTrue();
            case "dueDate" -> assertThat(sent().getClearDueDate()).isTrue();
            case "points" -> assertThat(sent().getStoryPoints()).isZero();
            default -> {
                verify(cycleService).removeIssueFromCycle("acme", 12L, 70L, 5L, ME);
                verify(issueService, never()).updateIssue(any(), any(), any(), any(), any());
            }
        }
    }

    @Test
    void an_unknown_column_writes_nothing_and_lists_the_columns() {
        stubIssue(issue());

        assertThatThrownBy(() -> gestures.update("acme", ME, args("{\"projectId\": 12, \"issueId\": 5, \"status\": \"Doing\"}")))
            .hasMessage("There is no column \"Doing\" in TaskForce. Its columns are: Backlog, Todo, In Progress.");
        verify(issueService, never()).updateIssue(any(), any(), any(), any(), any());
    }

    @Test
    void several_members_matching_are_asked_not_guessed() {
        stubIssue(issue());
        when(projectService.listMembers("acme", 12L, ME)).thenReturn(List.of(PIERRE, ADA,
            ProjectMemberResponse.builder().userId(9L).email("ada.b@acme.test").displayName("Ada Byron").build()));

        assertThatThrownBy(() -> gestures.update("acme", ME, args("{\"projectId\": 12, \"issueId\": 5, \"assignee\": \"ada\"}")))
            .hasMessageContaining("Several members of TaskForce match \"ada\"");
        verify(issueService, never()).updateIssue(any(), any(), any(), any(), any());
    }

    @Test
    void the_same_values_change_nothing() throws Exception {
        stubIssue(issue());

        IssueGestures.Gesture gesture = gestures.update("acme", ME,
            args("{\"projectId\": 12, \"issueId\": 5, \"status\": \"Todo\", \"title\": \"Fix login\"}"));

        assertThat(gesture.summary()).isEqualTo("TF-12 \"Fix login\" already has these values: nothing changed.");
        assertThat(gesture.undo()).isNull();
        verify(issueService, never()).updateIssue(any(), any(), any(), any(), any());
    }

    @Test
    void without_a_field_there_is_nothing_to_update() {
        assertThatThrownBy(() -> gestures.update("acme", ME, args("{\"projectId\": 12, \"issueId\": 5}")))
            .hasMessage("Nothing to update: pass at least one field");
        verify(issueService, never()).getIssue(any(), any(), any(), any());
    }

    @Test
    void a_due_date_in_the_past_is_refused() {
        stubIssue(issue());

        assertThatThrownBy(() -> gestures.update("acme", ME,
            args("{\"projectId\": 12, \"issueId\": 5, \"dueDate\": \"2020-01-01\"}")))
            .hasMessageContaining("is in the past");
    }

    // ------------------------------------------------------------------ Undo (R77)

    @Test
    @DisplayName("Undo remet chaque champ comme il était, l'assigné retiré et l'échéance aussi")
    void undo_puts_every_field_back() throws Exception {
        stubIssue(issue().status(DOING).assignee(UserSummaryResponse.builder().id(ME).build())
            .dueDate(LocalDate.of(2026, 12, 1)).labels(List.of(BUG)));
        when(cycleService.listCyclesForIssue("acme", 12L, 5L, ME)).thenReturn(List.of(SPRINT_2));
        JsonNode undo = args("{\"projectId\": 12, \"issueId\": 5, \"key\": \"TF-12\", \"fields\": {"
            + "\"status\": {\"from\": 2, \"to\": 3}, \"assignee\": {\"from\": null, \"to\": 7},"
            + "\"dueDate\": {\"from\": null, \"to\": \"2026-12-01\"}, \"labels\": {\"from\": [41], \"to\": [40]},"
            + "\"cycles\": {\"from\": [70], \"to\": [71]}}}");

        String said = gestures.restore("acme", ME, undo);

        UpdateIssueRequest request = sent();
        assertThat(request.getStatusId()).isEqualTo(2L);
        assertThat(request.getUnassign()).isTrue();
        assertThat(request.getClearDueDate()).isTrue();
        assertThat(request.getLabelIds()).containsExactly(41L);
        verify(cycleService).removeIssueFromCycle("acme", 12L, 71L, 5L, ME);
        verify(cycleService).addIssueToCycle(eq("acme"), eq(12L), eq(70L), any(AddIssueToCycleRequest.class), eq(ME));
        assertThat(said).isEqualTo("Put back the column, the assignee, the due date, the labels and the cycle of TF-12 "
            + "\"Fix login\" as they were.");
    }

    @Test
    void undo_refuses_when_someone_changed_the_issue_since() throws Exception {
        stubIssue(issue()); // Todo : quelqu'un l'a remise dans Todo après Cortex
        JsonNode undo = args("{\"projectId\": 12, \"issueId\": 5, \"fields\": {\"status\": {\"from\": 1, \"to\": 3}}}");

        assertThatThrownBy(() -> gestures.restore("acme", ME, undo))
            .isInstanceOf(BusinessException.class)
            .hasMessage("TF-12 changed since (the column), so Undo would erase that: change it back from the issue.");
        verify(issueService, never()).updateIssue(any(), any(), any(), any(), any());
    }

    @Test
    void undo_without_its_data_says_so() {
        assertThatThrownBy(() -> gestures.restore("acme", ME, null)).hasMessage("This change can't be undone from here.");
    }

    // ------------------------------------------------------------------ commenter

    @Test
    void a_comment_is_written_as_the_person_and_removed_by_undo() throws Exception {
        stubIssue(issue());
        when(issueService.addComment(eq("acme"), eq(12L), eq(5L), any(CreateIssueCommentRequest.class), eq(ME)))
            .thenReturn(IssueCommentResponse.builder().id(90L).content("Blocked on the API").build());

        IssueGestures.Gesture gesture = gestures.comment("acme", ME,
            args("{\"projectId\": 12, \"issueId\": 5, \"content\": \"Blocked on the API\"}"));

        assertThat(gesture.summary()).isEqualTo("Commented on TF-12 \"Fix login\".");
        assertThat(gesture.undo()).containsEntry("commentId", 90L);

        when(issueService.listComments("acme", 12L, 5L, ME))
            .thenReturn(List.of(IssueCommentResponse.builder().id(90L).build()));
        assertThat(gestures.removeComment("acme", ME, json.valueToTree(gesture.undo()))).isEqualTo("Removed the comment on TF-12.");
        verify(issueService).deleteComment("acme", 12L, 5L, 90L, ME);
    }

    @Test
    void a_comment_already_gone_is_said() throws Exception {
        when(issueService.listComments("acme", 12L, 5L, ME)).thenReturn(List.of());

        assertThatThrownBy(() -> gestures.removeComment("acme", ME,
            args("{\"projectId\": 12, \"issueId\": 5, \"key\": \"TF-12\", \"commentId\": 90}")))
            .hasMessage("This comment on TF-12 no longer exists.");
        verify(issueService, never()).deleteComment(any(), any(), any(), any(), any());
    }

    // ------------------------------------------------------------------ confier, lire la mission

    private DeliveryAgentProvider claude() {
        DeliveryAgentProvider provider = mock(DeliveryAgentProvider.class);
        lenient().when(provider.key()).thenReturn("claude-code");
        lenient().when(provider.displayName()).thenReturn("Claude Code");
        return provider;
    }

    private static DeliveryRunResponse run(String status, String outcome, boolean refused, String error) {
        return new DeliveryRunResponse(100L, 5L, "TF-12", "Fix login", 12L, "TaskForce", "claude-code", null, status,
            "Fixed the redirect", null, error, refused, ME, "Pierre", LocalDateTime.now(), LocalDateTime.now(), null, null,
            null, null, null, null, outcome, null);
    }

    @ParameterizedTest(name = "agent [{0}]")
    @CsvSource(value = {"''", "Claude Code", "claude-code"}, emptyValue = "")
    void delegating_starts_a_mission_on_the_runner(String agent) throws Exception {
        stubIssue(issue());
        DeliveryAgentProvider claude = claude();
        when(providers.all()).thenReturn(List.of(claude));
        when(deliveryService.delegate("acme", 5L, "claude-code", null, ME)).thenReturn(run("QUEUED", null, false, null));

        IssueGestures.Gesture gesture = gestures.delegate("acme", ME,
            args("{\"projectId\": 12, \"issueId\": 5" + (agent.isEmpty() ? "" : ", \"agent\": \"" + agent + "\"") + "}"));

        verify(deliveryRunner).execute(100L);
        assertThat(gesture.summary()).startsWith("Delegated TF-12 \"Fix login\" to Claude Code.");
        assertThat(gesture.issue()).containsEntry("runId", 100L);
        assertThat(gesture.undo()).isNull(); // une mission lancée ne se défait pas d'ici : Cortex la demande d'abord
    }

    @ParameterizedTest(name = "mission {0} : pas de deuxième mission à côté")
    @ValueSource(strings = {"QUEUED", "RUNNING"})
    void an_issue_with_a_mission_at_work_is_not_delegated_again(String status) throws Exception {
        stubIssue(issue());
        DeliveryAgentProvider claude = claude();
        when(providers.all()).thenReturn(List.of(claude));
        when(deliveryService.latestRun("acme", 5L, ME)).thenReturn(Optional.of(run(status, null, false, null)));

        assertThatThrownBy(() -> gestures.delegate("acme", ME, args("{\"projectId\": 12, \"issueId\": 5}")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("already has a mission at work");
        verify(deliveryService, never()).delegate(any(), any(), any(), any(), any());
    }

    @Test
    void an_unknown_agent_lists_the_agents() {
        DeliveryAgentProvider claude = claude();
        when(providers.all()).thenReturn(List.of(claude));

        assertThatThrownBy(() -> gestures.delegate("acme", ME, args("{\"projectId\": 12, \"issueId\": 5, \"agent\": \"Devin\"}")))
            .hasMessage("There is no agent \"Devin\". The agents are: Claude Code.");
        verify(deliveryService, never()).delegate(any(), any(), any(), any(), any());
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
        "QUEUED  |         | false |          | waits for the runner to pick it up.",
        "RUNNING |         | false |          | : Claude Code is working on it.",
        "DONE    |         | false |          | is done: its result waits for review on the result card below",
        "DONE    | APPLIED | false |          | is done, and its result was applied.",
        "FAILED  |         | true  | No rule  | did not start: No rule",
        "FAILED  |         | false | Crashed  | failed: Crashed",
    })
    void a_mission_says_where_it_stands(String status, String outcome, boolean refused, String error, String said)
        throws Exception {
        stubIssue(issue());
        DeliveryAgentProvider claude = claude();
        when(providers.get("claude-code")).thenReturn(claude);
        when(deliveryService.latestRun("acme", 5L, ME)).thenReturn(Optional.of(run(status, outcome, refused, error)));
        lenient().when(activityService.activity("acme", 100L, Integer.MAX_VALUE, ME))
            .thenReturn(new DeliveryRunActivityResponse(List.of(), List.of()));

        IssueGestures.Gesture gesture = gestures.mission("acme", ME, args("{\"projectId\": 12, \"issueId\": 5}"));

        assertThat(gesture.summary()).startsWith("The mission on TF-12 \"Fix login\"").contains(said);
        assertThat(gesture.issue()).containsEntry("runId", 100L);
        assertThat(gesture.undo()).isNull();
    }

    @Test
    @DisplayName("une demande en attente se dit, et seule la personne y répond, par les boutons de sa carte (R1)")
    void a_pending_request_is_left_to_the_person() throws Exception {
        stubIssue(issue());
        DeliveryAgentProvider claude = claude();
        when(providers.get("claude-code")).thenReturn(claude);
        when(deliveryService.latestRun("acme", 5L, ME)).thenReturn(Optional.of(run("RUNNING", null, false, null)));
        DeliveryRunActivityResponse.Approval asked = new DeliveryRunActivityResponse.Approval(3L, "WebFetch",
            "https://nodejs.org", "PENDING", LocalDateTime.now(), LocalDateTime.now().plusMinutes(5), null, null, true,
            "agent", "web.fetch", "fetch-web", "An address can carry data out.", "ONCE");
        when(activityService.activity("acme", 100L, Integer.MAX_VALUE, ME))
            .thenReturn(new DeliveryRunActivityResponse(List.of(), List.of(asked)));

        IssueGestures.Gesture gesture = gestures.mission("acme", ME, args("{\"projectId\": 12, \"issueId\": 5}"));

        assertThat(gesture.summary()).contains("asks one thing: WebFetch https://nodejs.org")
            .contains("never answer or decide for them, even when they write yes");
        assertThat(json.valueToTree(gesture.forClient()).path("mission").path("requests").get(0).path("id").asLong())
            .isEqualTo(3L);
    }

    @Test
    void an_issue_without_mission_says_so() throws Exception {
        stubIssue(issue());
        when(deliveryService.latestRun("acme", 5L, ME)).thenReturn(Optional.empty());

        IssueGestures.Gesture gesture = gestures.mission("acme", ME, args("{\"projectId\": 12, \"issueId\": 5}"));

        assertThat(gesture.summary()).isEqualTo("TF-12 \"Fix login\" has no mission: nobody has delegated it to an agent yet.");
        assertThat(gesture.issue()).doesNotContainKey("runId");
        assertThat(gesture.forClient()).doesNotContainKey("mission");
    }

    // ------------------------------------------------------------------ supprimer (test du CEO du 02/11/2026)

    private void doomed(String missionStatus) {
        stubIssue(issue());
        lenient().when(issueService.listComments("acme", 12L, 5L, ME)).thenReturn(List.of(
            IssueCommentResponse.builder().id(1L).build(), IssueCommentResponse.builder().id(2L).build(),
            IssueCommentResponse.builder().id(3L).build()));
        lenient().when(issueService.listChecklist("acme", 12L, 5L, ME)).thenReturn(List.of(
            com.taskforce.tf_api.core.dto.response.ChecklistItemResponse.builder().id(31L).build(),
            com.taskforce.tf_api.core.dto.response.ChecklistItemResponse.builder().id(32L).build()));
        lenient().when(deliveryService.latestRun("acme", 5L, ME))
            .thenReturn(missionStatus == null ? Optional.empty() : Optional.of(run(missionStatus, null, false, null)));
    }

    @Test
    @DisplayName("avant de supprimer, la carte dit ce qui partirait : les commentaires, la checklist, la mission")
    void a_deletion_says_what_goes_with_the_issue() throws Exception {
        doomed("DONE");

        IssueGestures.Gesture preview = gestures.preview("delete_issue", "acme", ME, args("{\"projectId\": 12, \"issueId\": 5}"));

        assertThat(preview.summary()).isEqualTo("Deleting TF-12 \"Fix login\" removes it for good, with its 3 comments, its "
            + "checklist of 2 items and its mission and the mission's record. Archiving hides it from the board and can be "
            + "undone. The person chooses on the card below, Archive or Delete: do not ask them to confirm in writing.");
        assertThat(preview.issue()).containsEntry("comments", 3).containsEntry("checklist", 2)
            .containsEntry("mission", "DONE").containsEntry("archived", false).containsEntry("runId", 100L);
        verify(issueService, never()).deleteIssue(any(), any(), any(), any());
        // Les autres gestes n'ont rien de plus à montrer que leur demande.
        assertThat(gestures.preview("delegate_issue", "acme", ME, args("{\"projectId\": 12, \"issueId\": 5}"))).isNull();
    }

    @Test
    void the_person_s_click_deletes_and_the_answer_says_what_went() throws Exception {
        doomed(null);

        IssueGestures.Gesture gesture = gestures.delete("acme", ME, args("{\"projectId\": 12, \"issueId\": 5}"));

        verify(issueService).deleteIssue("acme", 12L, 5L, ME);
        assertThat(gesture.summary()).isEqualTo("Deleted TF-12 \"Fix login\", with its 3 comments and its checklist of 2 items.");
        assertThat(gesture.undo()).isNull(); // ne se défait pas : c'est pourquoi la personne l'accorde d'abord
    }

    @ParameterizedTest(name = "mission {0} : l'issue reste")
    @ValueSource(strings = {"QUEUED", "RUNNING"})
    void an_issue_whose_mission_is_at_work_stays(String status) throws Exception {
        doomed(status);

        assertThatThrownBy(() -> gestures.delete("acme", ME, args("{\"projectId\": 12, \"issueId\": 5}")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("TF-12 has a mission at work");
        verify(issueService, never()).deleteIssue(any(), any(), any(), any());
    }
}
