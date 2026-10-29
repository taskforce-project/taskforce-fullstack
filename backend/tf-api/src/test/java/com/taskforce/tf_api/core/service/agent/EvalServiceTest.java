package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.response.EvalBankResponse;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.model.EvalBankSetting;
import com.taskforce.tf_api.core.model.EvalCase;
import com.taskforce.tf_api.core.model.EvalResult;
import com.taskforce.tf_api.core.model.EvalRun;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.EvalBankSettingRepository;
import com.taskforce.tf_api.core.repository.EvalCaseRepository;
import com.taskforce.tf_api.core.repository.EvalResultRepository;
import com.taskforce.tf_api.core.repository.EvalRunRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * La banque d'évaluations de Cortex (R61, séance n°10) : le cas figé depuis le dossier d'une
 * réponse, ses critères datés avant tout rejeu, l'interrupteur, les droits, et le rejeu d'un cas noté par du code.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Banque d'évaluations de Cortex")
class EvalServiceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final UUID RECORD = UUID.fromString("00000000-0000-0000-0000-0000000000bb");

    @Mock private BrainAccessGuard access;
    @Mock private AuthorizationService authorization;
    @Mock private CortexRecordService records;
    @Mock private KnowledgeNodeRepository nodes;
    @Mock private AgentToolRegistry tools;
    @Mock private AgentService agent;
    @Mock private AiUsageService aiUsage;
    @Mock private EvalCaseRepository cases;
    @Mock private EvalRunRepository runs;
    @Mock private EvalResultRepository results;
    @Mock private EvalBankSettingRepository settings;

    @InjectMocks private EvalService service;

    @BeforeEach
    void workspace() {
        lenient().when(access.resolveAndAuthorize("acme", 7L)).thenReturn(Workspace.builder().id(1L).slug("acme").build());
        lenient().when(records.owns(eq(RECORD), any())).thenReturn(true);
        lenient().when(cases.save(any())).thenAnswer(inv -> {
            EvalCase evalCase = inv.getArgument(0);
            if (evalCase.getId() == null) evalCase.setId(40L);
            return evalCase;
        });
        List<AgentTool> internal = new ArrayList<>();
        for (String name : List.of("search_brain", "list_projects", "list_issues", "create_issue", "create_note",
            "create_project", "find_integration")) {
            AgentTool tool = Mockito.mock(AgentTool.class);
            lenient().when(tool.name()).thenReturn(name);
            internal.add(tool);
        }
        lenient().when(tools.all()).thenReturn(internal);
    }

    private static ObjectNode event(int seq, String type, String actorKind, String actorId, String data) throws Exception {
        return EvidenceChain.event(seq, "2026-10-29T18:20:00.000Z", type, actorKind, actorId, JSON.readTree(data));
    }

    /** Une réponse de Cortex : une note servie, une lecture des projets, puis la création d'une issue. */
    private List<ObjectNode> answerThatCreatedAnIssue() throws Exception {
        return List.of(
            event(1, "mission.started", "person", "user-7",
                "{\"agent\":\"internal\",\"question\":\"Create an issue \\\"Kernel check\\\" in Cleanup check\","
                    + "\"model\":\"qwen3:8b\",\"tier\":\"fast\",\"notes\":[{\"id\":5,\"title\":\"Release plan\"}]}"),
            event(2, "action.requested", "agent", "cortex", "{\"tool\":\"list_projects\",\"arguments\":\"{ }\"}"),
            event(3, "action.decided", "rule", "read-issues", "{\"effect\":\"allow\",\"facts\":{\"action\":\"issue.read\"}}"),
            event(4, "action.result", "server", "taskforce",
                "{\"tool\":\"list_projects\",\"status\":\"success\",\"output\":\"- CLEANU Cleanup check: 1/1 open\"}"),
            event(5, "action.requested", "agent", "cortex", "{\"tool\":\"create_issue\",\"arguments\":"
                + "\"{\\\"project\\\":\\\"CLEANU\\\",\\\"title\\\":\\\"Kernel check\\\",\\\"description\\\":\\\"A long text\\\"}\"}"),
            event(6, "action.decided", "rule", "create-issue", "{\"effect\":\"allow\",\"facts\":{\"action\":\"issue.create\"}}"),
            event(7, "action.result", "server", "taskforce",
                "{\"tool\":\"create_issue\",\"status\":\"success\",\"output\":\"Created CLEANU-2\"}"));
    }

    private void stubRecord(List<ObjectNode> events) {
        when(records.events(RECORD)).thenReturn(events);
    }

    @Test
    @DisplayName("le brouillon fige la question, sa date, la note servie et la lecture ; il propose l'acte fait")
    void a_draft_proposes_the_act_that_was_made() throws Exception {
        stubRecord(answerThatCreatedAnIssue());
        when(nodes.findByIdAndWorkspaceId(5L, 1L)).thenReturn(Optional.of(
            KnowledgeNode.builder().title("Release plan").domain(NodeDomain.PROJET).content("Ship on Friday.").build()));

        EvalBankResponse.Draft draft = service.draft("acme", 7L, RECORD.toString());

        assertThat(draft.question()).isEqualTo("Create an issue \"Kernel check\" in Cleanup check");
        assertThat(draft.askedOn()).isEqualTo(LocalDate.of(2026, 10, 29));
        assertThat(draft.notes()).containsExactly("Release plan");
        assertThat(draft.calls()).extracting(EvalBankResponse.DraftCall::tool, EvalBankResponse.DraftCall::read)
            .containsExactly(tuple("list_projects", true), tuple("create_issue", false));
        assertThat(draft.criteria().tool()).isEqualTo("create_issue");
        assertThat(draft.criteria().args()).containsExactly(
            Map.entry("project", List.of("CLEANU")), Map.entry("title", List.of("Kernel check")));
        assertThat(draft.criteria().effect()).isEqualTo("allow");
    }

    @Test
    @DisplayName("une proposition accordée par la personne est l'acte qu'elle a validé")
    void an_approved_proposal_is_the_validated_act() throws Exception {
        stubRecord(List.of(
            event(1, "mission.started", "person", "user-7", "{\"agent\":\"internal\",\"question\":\"Write a note\"}"),
            event(2, "action.requested", "agent", "cortex", "{\"tool\":\"create_note\",\"arguments\":\"{\\\"title\\\":\\\"T\\\"}\"}"),
            event(3, "action.decided", "rule", "propose-knowledge", "{\"effect\":\"ask\",\"facts\":{\"action\":\"knowledge.write\"}}"),
            event(4, "action.result", "server", "taskforce", "{\"tool\":\"create_note\",\"status\":\"pending\",\"output\":\"Proposed\"}"),
            event(5, "human.decision", "person", "user-7", "{\"tool\":\"create_note\",\"decision\":\"approved\"}"),
            event(6, "action.decided", "rule", "propose-knowledge", "{\"effect\":\"ask\",\"facts\":{\"action\":\"knowledge.write\"}}"),
            event(7, "action.result", "server", "taskforce", "{\"tool\":\"create_note\",\"status\":\"success\",\"output\":\"Note created\"}")));

        EvalBankResponse.Draft draft = service.draft("acme", 7L, RECORD.toString());

        assertThat(draft.calls()).singleElement().satisfies(call -> assertThat(call.status()).isEqualTo("approved"));
        assertThat(draft.criteria().tool()).isEqualTo("create_note");
        assertThat(draft.criteria().effect()).isEqualTo("ask");
    }

    @Test
    @DisplayName("une réponse sans outil propose qu'aucun outil ne parte")
    void an_answer_without_tool_proposes_none() throws Exception {
        stubRecord(List.of(event(1, "mission.started", "person", "user-7", "{\"agent\":\"internal\",\"question\":\"Hi?\"}")));

        assertThat(service.draft("acme", 7L, RECORD.toString()).criteria().tool()).isEqualTo(EvalCriteria.NO_TOOL);
    }

    @Test
    @DisplayName("le cas est refait par le serveur depuis le dossier ; ses critères sont datés à sa création")
    void a_case_is_frozen_by_the_server() throws Exception {
        stubRecord(answerThatCreatedAnIssue());
        EvalCriteria criteria = new EvalCriteria("create_issue", Map.of("project", List.of("CLEANU", "Cleanup check")),
            "allow", null, null, null);

        EvalBankResponse.CaseSummary created = service.create("acme", 7L, RECORD.toString(), null, criteria);

        ArgumentCaptor<EvalCase> saved = ArgumentCaptor.forClass(EvalCase.class);
        verify(cases).save(saved.capture());
        EvalCase evalCase = saved.getValue();
        assertThat(evalCase.getCriteriaAt()).isEqualTo(evalCase.getCreatedAt());
        assertThat(evalCase.getSourceRecord()).isEqualTo(RECORD);
        assertThat(evalCase.getAskedOn()).isEqualTo(LocalDate.of(2026, 10, 29));
        assertThat(evalCase.getTitle()).isEqualTo("Create an issue \"Kernel check\" in Cleanup check");
        assertThat(evalCase.getCassette()).isEqualTo(
            "[{\"tool\":\"list_projects\",\"arguments\":\"{}\",\"output\":\"- CLEANU Cleanup check: 1/1 open\"}]");
        assertThat(created.tool()).isEqualTo("create_issue");
        assertThat(created.mine()).isTrue();
    }

    @Test
    @DisplayName("coupée, la banque ne prend plus de cas")
    void a_bank_turned_off_takes_no_case() {
        when(settings.findById(1L)).thenReturn(Optional.of(EvalBankSetting.builder().workspaceId(1L).enabled(false).build()));

        assertThatThrownBy(() -> service.draft("acme", 7L, RECORD.toString()))
            .isInstanceOf(BusinessException.class).hasMessageContaining("turned off");
        verify(records, never()).events(any());
    }

    @Test
    @DisplayName("le dossier d'une autre personne ne fait pas de cas")
    void someone_elses_record_makes_no_case() {
        when(records.owns(eq(RECORD), any())).thenReturn(false);

        assertThatThrownBy(() -> service.draft("acme", 7L, RECORD.toString()))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    static Stream<Arguments> invalidCriteria() {
        return Stream.of(
            Arguments.of("aucun critère", new EvalCriteria(null, null, null, null, null, null), "at least one criterion"),
            Arguments.of("un outil inconnu", new EvalCriteria("make_coffee", null, null, null, null, null), "Unknown tool"),
            Arguments.of("un outil interdit inconnu", new EvalCriteria(null, null, null, List.of("make_coffee"), null, null),
                "Unknown tool"),
            Arguments.of("un effet inconnu", new EvalCriteria("create_issue", null, "maybe", null, null, null), "allow, ask or deny"),
            Arguments.of("un mot vide", new EvalCriteria(null, null, null, null, List.of(" "), null), "expected words"));
    }

    @ParameterizedTest(name = "{0} : refusé")
    @MethodSource("invalidCriteria")
    void invalid_criteria_are_refused(String label, EvalCriteria criteria, String message) {
        assertThatThrownBy(() -> service.create("acme", 7L, RECORD.toString(), "T", criteria))
            .isInstanceOf(BusinessException.class).hasMessageContaining(message);
        verify(cases, never()).save(any());
    }

    @Test
    @DisplayName("un rejeu compte les cas dont les critères précèdent son départ ; une banque vide n'en ouvre pas")
    void a_run_counts_the_cases_written_before_it() {
        when(cases.countByWorkspaceIdAndArchivedFalseAndCriteriaAtLessThanEqual(eq(1L), any())).thenReturn(0L);

        assertThatThrownBy(() -> service.startRun("acme", 7L, "llama3.2"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("no case yet");
        verify(runs, never()).save(any());
    }

    private static EvalCase storedCase(LocalDateTime criteriaAt) {
        return EvalCase.builder().id(40L).workspaceId(1L).createdBy(7L).createdAt(criteriaAt).criteriaAt(criteriaAt)
            .title("Kernel check").question("Create an issue \"Kernel check\" in Cleanup check")
            .askedOn(LocalDate.of(2026, 10, 29)).notes("[]")
            .cassette("[{\"tool\":\"list_projects\",\"arguments\":\"{}\",\"output\":\"- CLEANU Cleanup check\"}]")
            .criteria("{\"tool\":\"create_issue\",\"args\":{\"project\":[\"CLEANU\"]},\"effect\":\"allow\"}")
            .archived(false).build();
    }

    @Test
    @DisplayName("un cas rejoué : le quota d'abord, le modèle du rejeu, une note par du code, le rejeu soldé")
    void a_case_replayed_is_graded_and_counted() {
        LocalDateTime start = LocalDateTime.of(2026, 10, 29, 19, 0);
        EvalRun run = EvalRun.builder().id(9L).workspaceId(1L).startedAt(start).model("llama3.2").total(1).build();
        when(runs.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(run));
        when(cases.findByIdAndWorkspaceId(40L, 1L)).thenReturn(Optional.of(storedCase(start.minusHours(1))));
        when(results.findByRunIdAndCaseId(9L, 40L)).thenReturn(Optional.empty());
        ArgumentCaptor<ReplayCase> replayed = ArgumentCaptor.forClass(ReplayCase.class);
        when(agent.replay(any(), replayed.capture(), eq("llama3.2"))).thenReturn(new ReplayOutcome("Proposed.",
            List.of(new ReplayOutcome.ReplayCall("create_issue", "{\"project\":\"CLEANU\"}", "allow", "pending")),
            "llama3.2", new LlmUsage(10, 5, 15)));
        when(results.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(results.countByRunIdAndPassedTrue(9L)).thenReturn(1L);
        when(results.countByRunId(9L)).thenReturn(1L);

        EvalBankResponse.Result result = service.runCase("acme", 7L, 9L, 40L);

        assertThat(result.passed()).isTrue();
        assertThat(result.model()).isEqualTo("llama3.2");
        assertThat(replayed.getValue().served("list_projects", "{ }")).isEqualTo("- CLEANU Cleanup check");
        InOrder order = Mockito.inOrder(aiUsage, agent);
        order.verify(aiUsage).assertWithinQuota(1L);
        order.verify(agent).replay(any(), any(), eq("llama3.2"));
        verify(aiUsage).record(eq(1L), eq(new LlmUsage(10, 5, 15)));
        assertThat(run.getPassed()).isEqualTo(1);
        assertThat(run.getFinishedAt()).isNotNull();
    }

    @Test
    @DisplayName("un cas écrit après le départ du rejeu n'y entre pas")
    void a_case_written_after_the_run_is_refused() {
        LocalDateTime start = LocalDateTime.of(2026, 10, 29, 19, 0);
        when(runs.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(
            EvalRun.builder().id(9L).workspaceId(1L).startedAt(start).model("default").total(1).build()));
        when(cases.findByIdAndWorkspaceId(40L, 1L)).thenReturn(Optional.of(storedCase(start.plusMinutes(5))));
        when(results.findByRunIdAndCaseId(9L, 40L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.runCase("acme", 7L, 9L, 40L))
            .isInstanceOf(BusinessException.class).hasMessageContaining("after the run started");
        verify(agent, never()).replay(any(), any(), any());
    }

    @Test
    @DisplayName("un cas déjà noté dans ce rejeu ne se rejoue pas")
    void a_case_already_graded_is_not_replayed() {
        LocalDateTime start = LocalDateTime.of(2026, 10, 29, 19, 0);
        when(runs.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(
            EvalRun.builder().id(9L).workspaceId(1L).startedAt(start).model("default").total(1).build()));
        when(cases.findByIdAndWorkspaceId(40L, 1L)).thenReturn(Optional.of(storedCase(start.minusHours(1))));
        when(results.findByRunIdAndCaseId(9L, 40L)).thenReturn(Optional.of(EvalResult.builder().runId(9L).caseId(40L)
            .passed(false).details("{\"checks\":[],\"calls\":[],\"answer\":\"No.\",\"model\":\"qwen3:8b\"}").build()));

        EvalBankResponse.Result result = service.runCase("acme", 7L, 9L, 40L);

        assertThat(result.passed()).isFalse();
        assertThat(result.answer()).isEqualTo("No.");
        verify(agent, never()).replay(any(), any(), any());
        verify(aiUsage, never()).assertWithinQuota(any());
    }

    @Test
    @DisplayName("un cas s'archive par la personne qui l'a ajouté, ou par un gestionnaire, pas par un autre membre")
    void only_its_author_or_a_manager_archives_a_case() {
        EvalCase other = storedCase(LocalDateTime.now());
        other.setCreatedBy(8L);
        when(cases.findByIdAndWorkspaceId(40L, 1L)).thenReturn(Optional.of(other));
        when(authorization.isManager(1L, 7L)).thenReturn(false);

        assertThatThrownBy(() -> service.archive("acme", 7L, 40L)).isInstanceOf(ForbiddenException.class);
        verify(cases, never()).save(any());
    }

    @Test
    @DisplayName("l'interrupteur demande un gestionnaire, puis se garde avec qui l'a tourné")
    void the_switch_needs_a_manager() {
        when(authorization.requireManager(1L, 7L)).thenThrow(new ForbiddenException("You don't have the permission"));

        assertThatThrownBy(() -> service.setEnabled("acme", 7L, false)).isInstanceOf(ForbiddenException.class);
        verify(settings, never()).save(any());
    }

    @Test
    @DisplayName("sans réglage, la banque est ouverte : un cas ne naît que d'un geste")
    void a_bank_without_setting_is_open() {
        when(cases.findByWorkspaceIdAndArchivedFalseOrderByCreatedAtDesc(1L)).thenReturn(List.of(storedCase(LocalDateTime.now())));
        when(runs.findTop10ByWorkspaceIdOrderByStartedAtDesc(1L)).thenReturn(List.of());
        when(settings.findById(1L)).thenReturn(Optional.empty());

        EvalBankResponse bank = service.bank("acme", 7L);

        assertThat(bank.enabled()).isTrue();
        assertThat(bank.cases()).singleElement().satisfies(c -> {
            assertThat(c.tool()).isEqualTo("create_issue");
            assertThat(c.mine()).isTrue();
        });
    }

}
