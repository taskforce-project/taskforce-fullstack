package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead;
import com.taskforce.tf_api.core.dto.response.IssueTypeResponse;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.Cell;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse.ModelDetail;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.model.ModelBlindTrial;
import com.taskforce.tf_api.core.model.ModelBlindTrialAnswer;
import com.taskforce.tf_api.core.model.ModelCapabilityResult;
import com.taskforce.tf_api.core.model.ModelCapabilityRun;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ModelBlindTrialAnswerRepository;
import com.taskforce.tf_api.core.repository.ModelBlindTrialRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityResultRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityRunRepository;
import com.taskforce.tf_api.core.service.AiGatewayClient;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmTimedOutException;
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.core.service.ai.ModelProviderException;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Le banc des modèles (R131) : le verdict en mots vient de la dernière note de chaque cas, une personne peut le retourner, un
 * passage note chaque cas une fois, et l'essai à l'aveugle ne nomme aucun modèle avant le choix ni ne montre une réponse à une
 * autre personne.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Le banc des modèles")
class ModelBenchmarkServiceTest {

    private static final LocalDateTime AT = LocalDateTime.of(2026, 11, 8, 10, 0);
    private static final List<String> SERVED = List.of("qwen3:14b", "bge-m3:latest", "qwen3:8b", "qwen3.5:9b");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ReplayOutcome ANSWERED = new ReplayOutcome("Une réponse.", List.of(), "qwen3:8b", new LlmUsage(10, 5, 15));

    @Mock private BrainAccessGuard access;
    @Mock private AiStatusService aiStatus;
    @Mock private AgentService agent;
    @Mock private AiUsageService aiUsage;
    @Mock private ModelCapabilityService capabilities;
    @Mock private EvalService evals;
    @org.mockito.Spy private ModelCallStops stops = new ModelCallStops();
    @Mock private IssueMaterial material;
    @Mock private ScreenContext screens;
    @Mock private ProjectService projects;
    @Mock private IssueService issues;
    @Mock private ModelCapabilityRunRepository runs;
    @Mock private ModelCapabilityResultRepository results;
    @Mock private ModelBlindTrialRepository trials;
    @Mock private ModelBlindTrialAnswerRepository trialAnswers;

    @InjectMocks private ModelBenchmarkService service;

    /** Une note telle que le banc la lit. */
    private record Row(Long getId, Long getRunId, String getCaseKey, Boolean getPassed, Long getDurationMs, Boolean getPersonPassed,
                       Long getPersonId, Boolean getTooSlow, LocalDateTime getCreatedAt) implements ModelCapabilityResultRepository.BenchmarkRow {
        Row(Long id, Long runId, String caseKey, Boolean passed, Long durationMs, Boolean personPassed, Long personId, LocalDateTime createdAt) {
            this(id, runId, caseKey, passed, durationMs, personPassed, personId, false, createdAt);
        }
    }

    private final List<ModelCapabilityRun> played = new ArrayList<>();
    private final List<ModelCapabilityResultRepository.BenchmarkRow> notes = new ArrayList<>();
    private long nextResult = 100;

    @BeforeEach
    void instance() {
        Workspace ws = Workspace.builder().id(1L).slug("acme").build();
        lenient().when(access.resolveAndAuthorize("acme", 7L)).thenReturn(ws);
        AiProviderSettings settings = AiProviderSettings.from(Map.of("AI_PROVIDER", "ollama")::get);
        AiStatusService.AiStatus status = new AiStatusService.AiStatus(true, true, "qwen3:8b", "qwen3:8b", true, "bge-m3");
        lenient().when(aiStatus.snapshot()).thenReturn(new AiStatusService.Snapshot(settings, status, true, SERVED, SERVED));
        lenient().when(capabilities.chosenModel(7L)).thenReturn(null);
        lenient().when(capabilities.cortexModel(null)).thenReturn("qwen3:8b");
        lenient().when(capabilities.requestedModel(anyString())).thenAnswer(call -> {
            String model = call.getArgument(0);
            if (model.isBlank()) return null;
            if (!SERVED.contains(model)) throw new BusinessException("The AI of this instance doesn't serve " + model + ".");
            return model;
        });
        lenient().when(runs.findTop200ByWorkspaceIdAndSuiteAndSuiteVersionOrderByStartedAtDesc(1L, BenchmarkSuite.SUITE, BenchmarkSuite.VERSION))
            .thenReturn(played);
        lenient().when(results.findBenchmarkRowsByRunIdIn(anyCollection())).thenReturn(notes);
        lenient().when(trials.findTop30ByWorkspaceIdAndUserIdAndDecidedAtIsNotNullOrderByDecidedAtDesc(1L, 7L)).thenReturn(List.of());
        lenient().when(evals.scores(1L)).thenReturn(new EvalService.BankScores(0, Map.of()));
    }

    /** Un passage de {@code model}, à {@code at} : chaque cas réussi, sauf ceux de {@code failed}. */
    private void run(long runId, String model, LocalDateTime at, List<String> failed) {
        played.add(ModelCapabilityRun.builder().id(runId).model(model).suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION)
            .startedAt(at).total(BenchmarkSuite.cases().size()).build());
        for (BenchmarkSuite.BenchmarkCase c : BenchmarkSuite.cases()) {
            notes.add(new Row(nextResult++, runId, c.key(), !failed.contains(c.key()), 20_000L, null, null, at));
        }
    }

    private static Cell cell(ModelBenchmarkResponse matrix, String model, BenchmarkTask task) {
        return matrix.models().stream().filter(row -> row.model().equals(model)).findFirst().orElseThrow()
            .cells().stream().filter(c -> c.task().equals(task.key())).findFirst().orElseThrow();
    }

    // -------------------------------------------------------------------------
    // La matrice
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("la matrice : le modèle en service d'abord, puis l'ordre d'installation, jamais un classement, sans modèle de vecteurs")
    void theModelInUseComesFirst() {
        run(1L, "qwen3:8b", AT, List.of("summarize-thin-fr"));

        ModelBenchmarkResponse matrix = service.matrix("acme", 7L);

        assertThat(matrix.models()).extracting(ModelBenchmarkResponse.ModelRow::model).containsExactly("qwen3:8b", "qwen3:14b", "qwen3.5:9b");
        assertThat(matrix.models().get(0).current()).isTrue();
        assertThat(matrix.models().get(0).lastRunAt()).isEqualTo(AT);
        assertThat(matrix.provider()).isEqualTo("OLLAMA");
        assertThat(matrix.cases()).isEqualTo(BenchmarkSuite.cases().size());
        assertThat(matrix.tasks()).hasSize(7);
        assertThat(matrix.tasks().get(0).trial()).isTrue();
    }

    @ParameterizedTest(name = "{0} sur {1} (de {2}), {3} trop lents : {4}")
    @CsvSource({"3,3,3,0,give_it", "4,4,4,0,give_it", "2,3,3,0,with_review", "2,4,4,0,with_review", "1,3,3,0,not_yet", "0,3,3,0,not_yet", "1,4,4,0,not_yet",
        "3,3,4,0,", "0,0,3,0,", "2,3,3,1,too_slow", "0,3,3,3,too_slow", "1,2,3,1,"})
    @DisplayName("le verdict : tous les cas, au moins la moitié, moins, trop lent, et rien tant que la tâche n'est pas finie")
    void theVerdictInWords(int passed, int measured, int total, int tooSlow, String expected) {
        assertThat(ModelBenchmarkService.verdict(passed, measured, total, tooSlow)).isEqualTo(expected);
    }

    @Test
    @DisplayName("un cas trop lent donne le verdict « Too slow here » à sa tâche, qui n'est ni raté ni réussi")
    void aCaseTooSlowMarksItsTask() {
        played.add(ModelCapabilityRun.builder().id(1L).model("qwen3:8b").suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).startedAt(AT).build());
        for (BenchmarkSuite.BenchmarkCase c : BenchmarkSuite.cases()) {
            boolean late = "triage-outage-en".equals(c.key());
            notes.add(new Row(nextResult++, 1L, c.key(), !late, 20_000L, null, null, late, AT));
        }

        ModelBenchmarkResponse matrix = service.matrix("acme", 7L);

        Cell triage = cell(matrix, "qwen3:8b", BenchmarkTask.TRIAGE);
        assertThat(triage.verdict()).isEqualTo("too_slow");
        assertThat(triage.tooSlow()).isEqualTo(1);
        assertThat(triage.passed()).isEqualTo(2);
        assertThat(cell(matrix, "qwen3:8b", BenchmarkTask.SUMMARIZE).verdict()).isEqualTo("give_it");
    }

    @Test
    @DisplayName("chaque ligne dit ce qu'on sait du modèle : sa fiche, et où il tenait à son dernier chargement")
    void theFactsOfAModel() {
        when(aiStatus.describe(anyString())).thenAnswer(call -> "qwen3:14b".equals(call.getArgument(0))
            ? Optional.of(new ModelGateway.ModelCard("14.8B", 40960, true, "qwen3", true, 9_276_198_565L))
            : Optional.empty());
        played.add(ModelCapabilityRun.builder().id(2L).model("qwen3:14b").suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).startedAt(AT)
            .loadMs(10_000L).memoryBytes(10_950_000_000L).gpuBytes(6_120_000_000L).build());
        played.add(ModelCapabilityRun.builder().id(1L).model("qwen3:14b").suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).startedAt(AT.minusDays(1))
            .loadProblem("too_slow").build());

        ModelBenchmarkResponse.ModelFacts facts = service.matrix("acme", 7L).models().stream()
            .filter(row -> row.model().equals("qwen3:14b")).findFirst().orElseThrow().facts();

        assertThat(facts.family()).isEqualTo("qwen3");
        assertThat(facts.parameters()).isEqualTo("14.8B");
        assertThat(facts.diskBytes()).isEqualTo(9_276_198_565L);
        assertThat(facts.chat()).isTrue();
        assertThat(facts.memoryBytes()).isEqualTo(10_950_000_000L);
        assertThat(facts.gpuBytes()).isEqualTo(6_120_000_000L);
        assertThat(facts.loadProblem()).as("le dernier chargement a abouti").isNull();
    }

    @Test
    @DisplayName("la colonne « Your tests » n'existe que si l'espace a des cas, et dit le dernier rejeu de chaque modèle")
    void yourTests() {
        assertThat(service.matrix("acme", 7L).tasks()).hasSize(7);

        when(evals.scores(1L)).thenReturn(new EvalService.BankScores(3, Map.of("qwen3:8b", new EvalService.BankScore(2, 3, 3, AT))));
        ModelBenchmarkResponse matrix = service.matrix("acme", 7L);

        assertThat(matrix.tasks()).hasSize(8);
        assertThat(matrix.tasks().get(7).key()).isEqualTo(ModelBenchmarkService.YOUR_TESTS);
        assertThat(matrix.tasks().get(7).label()).isEqualTo("Your tests");
        assertThat(matrix.models().get(0).cells().get(7)).isEqualTo(new Cell("bank", "with_review", 2, 3, 3, null, 0));
        assertThat(matrix.models().get(1).cells().get(7)).isEqualTo(new Cell("bank", null, 0, 0, 3, null, 0));
    }

    @Test
    @DisplayName("l'histoire : les passages qui ont noté quelque chose, le plus récent d'abord")
    void theHistory() {
        run(2L, "qwen3:8b", AT, List.of("triage-outage-en"));
        played.add(ModelCapabilityRun.builder().id(1L).model("qwen3:14b").suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).startedAt(AT.minusDays(1)).total(22).build());

        List<ModelBenchmarkResponse.RunLine> history = service.history("acme", 7L);

        assertThat(history).singleElement().satisfies(line -> {
            assertThat(line.model()).isEqualTo("qwen3:8b");
            assertThat(line.measured()).isEqualTo(BenchmarkSuite.cases().size());
            assertThat(line.passed()).isEqualTo(BenchmarkSuite.cases().size() - 1);
            assertThat(line.tooSlow()).isZero();
        });
    }

    @Test
    @DisplayName("sans passage, l'histoire est vide et ne lit rien")
    void noHistory() {
        assertThat(service.history("acme", 7L)).isEmpty();
        verify(results, never()).findBenchmarkRowsByRunIdIn(any(Collection.class));
    }

    @Test
    @DisplayName("la dernière note de chaque cas compte, et une tâche passée à moitié n'a pas de verdict")
    void theLatestNoteCounts() {
        run(1L, "qwen3:8b", AT.minusDays(1), List.of("triage-outage-en", "triage-shouting-fr", "triage-quiet-leak-fr"));
        run(2L, "qwen3:8b", AT, List.of("triage-outage-en"));
        played.add(ModelCapabilityRun.builder().id(3L).model("qwen3:14b").suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).startedAt(AT).build());
        notes.add(new Row(900L, 3L, "code-pagination-ts", true, 5000L, null, null, AT));

        ModelBenchmarkResponse matrix = service.matrix("acme", 7L);

        assertThat(cell(matrix, "qwen3:8b", BenchmarkTask.TRIAGE).verdict()).isEqualTo("with_review");
        assertThat(cell(matrix, "qwen3:8b", BenchmarkTask.TRIAGE).passed()).isEqualTo(2);
        assertThat(cell(matrix, "qwen3:8b", BenchmarkTask.SUMMARIZE).verdict()).isEqualTo("give_it");
        assertThat(cell(matrix, "qwen3:14b", BenchmarkTask.CODE).verdict()).isNull();
        assertThat(cell(matrix, "qwen3:14b", BenchmarkTask.CODE).measured()).isEqualTo(1);
        assertThat(cell(matrix, "qwen3.5:9b", BenchmarkTask.CODE).verdict()).isNull();
    }

    static Stream<Arguments> judges() {
        return Stream.of(
            Arguments.of(false, 7L, "you", "give_it"), // la personne retourne le raté : il compte comme réussi, et le verdict est le sien
            Arguments.of(false, 8L, "member", "give_it"),
            Arguments.of(true, 7L, "you", "give_it"));
    }

    @ParameterizedTest(name = "note du code {0}, retournée par {1} : {2}")
    @MethodSource("judges")
    @DisplayName("une note retournée compte à la place de celle du code, et le verdict dit de qui il est")
    void aPersonOverturnsACase(boolean graded, Long person, String judge, String verdict) {
        played.add(ModelCapabilityRun.builder().id(1L).model("qwen3:8b").suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).startedAt(AT).build());
        for (BenchmarkSuite.BenchmarkCase c : BenchmarkSuite.cases()) {
            boolean turned = "code-pagination-ts".equals(c.key());
            notes.add(new Row(nextResult++, 1L, c.key(), turned ? graded : true, 20_000L, turned ? Boolean.TRUE : null, turned ? person : null, AT));
        }

        Cell code = cell(service.matrix("acme", 7L), "qwen3:8b", BenchmarkTask.CODE);

        assertThat(code.verdict()).isEqualTo(verdict);
        assertThat(code.judge()).isEqualTo(judge);
    }

    @Test
    @DisplayName("la durée approchée : le chargement, les capacités et les tâches ; les derniers temps du modèle, à défaut ceux des autres, à défaut une estimation")
    void theRoughDuration() {
        long everyCase = BenchmarkSuite.cases().size() + CapabilitySuite.cases().size();
        long load = ModelBenchmarkService.DEFAULT_LOAD_MS / 1000;
        ModelBenchmarkResponse none = service.matrix("acme", 7L);
        assertThat(none.models().get(1).estimateSeconds()).isEqualTo(load + everyCase * ModelBenchmarkService.DEFAULT_CASE_MS / 1000);

        run(1L, "qwen3:8b", AT, List.of());
        ModelBenchmarkResponse some = service.matrix("acme", 7L);
        assertThat(some.models().get(0).estimateSeconds()).isEqualTo(load + everyCase * 20L);
        assertThat(some.models().get(1).estimateSeconds()).isEqualTo(load + everyCase * 20L);
    }

    @Test
    @DisplayName("hors de l'espace : refusé, rien n'est lu")
    void aStrangerIsRefused() {
        when(access.resolveAndAuthorize("acme", 9L)).thenThrow(new ForbiddenException("no"));

        assertThatThrownBy(() -> service.matrix("acme", 9L)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.detail("acme", 9L, "qwen3:8b")).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.startTrial("acme", 9L, 3L, 4L, "summarize", List.of("qwen3:8b", "qwen3:14b"))).isInstanceOf(ForbiddenException.class);
        verifyNoInteractions(runs, trials);
    }

    // -------------------------------------------------------------------------
    // Le passage
    // -------------------------------------------------------------------------

    private ModelCapabilityRun benchmarkRun() {
        ModelCapabilityRun run = ModelCapabilityRun.builder().id(9L).workspaceId(1L).model("qwen3:8b").suite(BenchmarkSuite.SUITE)
            .suiteVersion(BenchmarkSuite.VERSION).total(BenchmarkSuite.cases().size()).startedAt(AT).build();
        lenient().when(runs.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(run));
        return run;
    }

    private void savesResults() {
        lenient().when(results.save(any())).thenAnswer(call -> {
            ModelCapabilityResult result = call.getArgument(0);
            result.setId(55L);
            return result;
        });
    }

    @Test
    @DisplayName("ouvrir un passage : un modèle servi, tous les cas de la suite, dans leur ordre")
    void aRunStarts() {
        when(runs.save(any())).thenAnswer(call -> {
            ModelCapabilityRun run = call.getArgument(0);
            run.setId(9L);
            return run;
        });

        ModelBenchmarkResponse.RunStarted started = service.start("acme", 7L, "qwen3:14b");

        assertThat(started.runId()).isEqualTo(9L);
        assertThat(started.cases()).hasSameSizeAs(BenchmarkSuite.cases()).contains("act-three-steps", "code-slugify-ts");
        ArgumentCaptor<ModelCapabilityRun> saved = ArgumentCaptor.forClass(ModelCapabilityRun.class);
        verify(runs).save(saved.capture());
        assertThat(saved.getValue().getSuite()).isEqualTo(BenchmarkSuite.SUITE);
        assertThat(saved.getValue().getSuiteVersion()).isEqualTo(BenchmarkSuite.VERSION);
        assertThatThrownBy(() -> service.start("acme", 7L, "nope")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.start("acme", 7L, " ")).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("jouer un cas sans outil : la matière, la question, la note du code, la réponse et son temps ; ni outil, ni écriture")
    void aCaseWithoutTools() {
        benchmarkRun();
        savesResults();
        when(agent.answerFrom(any(), anyString(), eq(BenchmarkSuite.ASKED_ON), eq("qwen3:8b"))).thenReturn(
            new ReplayOutcome("OPS-35 ne contient ni description ni commentaire.", List.of(), "qwen3:8b", new LlmUsage(100, 20, 120)));

        ModelBenchmarkResponse.CaseDetail result = service.play("acme", 7L, 9L, "summarize-thin-fr");

        assertThat(result.passed()).isTrue();
        assertThat(result.gradedPassed()).isTrue();
        assertThat(result.durationMs()).isNotNull();
        assertThat(result.answer()).startsWith("OPS-35");
        assertThat(result.checks()).isNotEmpty();
        verify(aiUsage).assertWithinQuota(1L);
        verify(aiUsage).record(eq(1L), any());
        verify(agent, never()).replay(any(), any(), anyString());
        ArgumentCaptor<ModelCapabilityResult> saved = ArgumentCaptor.forClass(ModelCapabilityResult.class);
        verify(results).save(saved.capture());
        assertThat(saved.getValue().getCapability()).isEqualTo("summarize");
        assertThat(saved.getValue().getDurationMs()).isNotNull();
    }

    @Test
    @DisplayName("jouer un cas d'Act : les outils de Cortex, sur une cassette ; la note dit quels appels ont été faits")
    void aCaseWithTools() {
        benchmarkRun();
        savesResults();
        when(agent.replay(any(), any(), eq("qwen3:8b"))).thenReturn(new ReplayOutcome("Done.", List.of(
            new ReplayOutcome.ReplayCall("update_issue", "{\"issue\":\"BILL-214\",\"status\":\"In Review\"}", "allow", "success"),
            new ReplayOutcome.ReplayCall("add_comment", "{\"issue\":\"BILL-214\",\"content\":\"Deployed on staging.\"}", "allow", "success")),
            "qwen3:8b", new LlmUsage(100, 20, 120)));

        ModelBenchmarkResponse.CaseDetail result = service.play("acme", 7L, 9L, "act-move-and-comment");

        assertThat(result.passed()).isTrue();
        assertThat(result.calls()).extracting(ReplayOutcome.ReplayCall::tool).containsExactly("update_issue", "add_comment");
        verify(agent, never()).answerFrom(any(), anyString(), any(), anyString());
    }

    @Test
    @DisplayName("un modèle qui refuse les outils rate Act, sans être une panne à rejouer")
    void aModelThatTakesNoTools() {
        benchmarkRun();
        savesResults();
        when(agent.replay(any(), any(), eq("qwen3:8b"))).thenThrow(new LlmToolsRefusedException("no tools", new RuntimeException()));

        ModelBenchmarkResponse.CaseDetail result = service.play("acme", 7L, 9L, "act-three-steps");

        assertThat(result.passed()).isFalse();
        assertThat(result.checks()).singleElement().satisfies(check -> {
            assertThat(check.passed()).isFalse();
            assertThat(check.criterion()).isEqualTo(ModelCapabilityService.TAKES_TOOLS);
        });
    }

    @Test
    @DisplayName("une panne du modèle se dit, sans 500 et sans note, pour que le cas se rejoue")
    void aFailureIsNotAGrade() {
        benchmarkRun();
        when(agent.answerFrom(any(), anyString(), any(), anyString())).thenThrow(new AiGatewayClient.LlmException("down", null));

        assertThatThrownBy(() -> service.play("acme", 7L, 9L, "summarize-thin-fr"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("qwen3:8b stopped answering");
        verify(results, never()).save(any());
    }

    @Test
    @DisplayName("un cas qui dépasse son budget est un verdict, jamais une erreur : il se note « trop lent », avec son temps")
    void aCaseTooSlow() {
        benchmarkRun();
        savesResults();
        when(agent.answerFrom(any(), anyString(), any(), anyString())).thenThrow(new LlmTimedOutException("late", null));

        ModelBenchmarkResponse.CaseDetail result = service.play("acme", 7L, 9L, "summarize-thin-fr");

        assertThat(result.tooSlow()).isTrue();
        assertThat(result.passed()).isFalse();
        assertThat(result.answer()).isEmpty();
        assertThat(result.durationMs()).isNotNull();
        assertThat(result.checks()).singleElement().satisfies(check -> {
            assertThat(check.criterion()).isEqualTo(ModelCapabilityService.ANSWERS_IN_TIME);
            assertThat(check.detail()).contains("too slow here");
        });
        ArgumentCaptor<ModelCapabilityResult> saved = ArgumentCaptor.forClass(ModelCapabilityResult.class);
        verify(results).save(saved.capture());
        assertThat(saved.getValue().isTooSlow()).isTrue();
        verify(aiUsage, never()).record(any(), org.mockito.ArgumentMatchers.argThat(usage -> usage != null && usage.totalTokens() > 0));
    }

    @Test
    @DisplayName("un cas d'Act trop lent : même verdict, le budget vaut pour tous ses appels au modèle")
    void aCaseWithToolsTooSlow() {
        benchmarkRun();
        savesResults();
        when(agent.replay(any(), any(), eq("qwen3:8b"))).thenAnswer(call -> {
            assertThat(com.taskforce.tf_api.core.service.ai.ModelDeadline.remaining()).hasValueSatisfying(left ->
                assertThat(left).isLessThanOrEqualTo(BenchmarkSuite.CASE_BUDGET));
            throw new LlmTimedOutException("late", null);
        });

        assertThat(service.play("acme", 7L, 9L, "act-three-steps").tooSlow()).isTrue();
    }

    @Test
    @DisplayName("un cas arrêté par la personne ne se note pas")
    void aStoppedCaseIsNotGraded() {
        benchmarkRun();
        when(agent.answerFrom(any(), anyString(), any(), anyString())).thenAnswer(call -> {
            Thread.currentThread().interrupt();
            throw new AiGatewayClient.LlmException("Stopped", null);
        });

        assertThatThrownBy(() -> service.play("acme", 7L, 9L, "summarize-thin-fr")).isInstanceOf(ModelCallStops.Stopped.class);
        verify(results, never()).save(any());
        assertThat(Thread.currentThread().isInterrupted()).isFalse();
    }

    @Test
    @DisplayName("« Stop » : la personne, dans son espace")
    void stopping() {
        service.stop("acme", 7L);
        verify(stops).stop(1L, 7L);
    }

    @Test
    @DisplayName("un modèle de base complète du texte : il le dit, il ne se passe pas et ne s'essaie pas")
    void aBaseModelIsNotRun() {
        when(aiStatus.describe("qwen3:14b")).thenReturn(Optional.of(new ModelGateway.ModelCard("7.6B", 32768, false, "qwen2", false, null)));

        assertThatThrownBy(() -> service.start("acme", 7L, "qwen3:14b"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("can't hold a conversation");
        assertThatThrownBy(() -> service.startTrial("acme", 7L, 3L, 4L, "summarize", List.of("qwen3:14b")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("can't hold a conversation");
        verify(runs, never()).save(any());
    }

    // -------------------------------------------------------------------------
    // Le chargement
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("charger le modèle d'un passage : son temps, et où il tient, retenus avec le passage")
    void loadingAModel() {
        ModelCapabilityRun run = benchmarkRun();
        when(aiStatus.load("qwen3:8b", BenchmarkSuite.LOAD_BUDGET)).thenReturn(Optional.of(new ModelGateway.LoadedModel(6_740_000_000L, 6_170_000_000L)));

        ModelBenchmarkResponse.LoadResult result = service.load("acme", 7L, 9L);

        assertThat(result.status()).isEqualTo("loaded");
        assertThat(result.memoryBytes()).isEqualTo(6_740_000_000L);
        assertThat(result.gpuBytes()).isEqualTo(6_170_000_000L);
        assertThat(result.loadMs()).isNotNull();
        assertThat(run.getLoadMs()).isNotNull();
        assertThat(run.getGpuBytes()).isEqualTo(6_170_000_000L);
        verify(runs).save(run);
    }

    @Test
    @DisplayName("hors d'Ollama, rien à charger : le passage continue, sans chiffre de mémoire")
    void nothingToLoad() {
        ModelCapabilityRun run = benchmarkRun();
        when(aiStatus.load("qwen3:8b", BenchmarkSuite.LOAD_BUDGET)).thenReturn(Optional.empty());

        assertThat(service.load("acme", 7L, 9L).status()).isEqualTo("loaded");
        assertThat(run.getGpuBytes()).isNull();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loadProblems")
    @DisplayName("un chargement qui n'aboutit pas est un résultat, jamais une erreur")
    void loadProblems(RuntimeException failure, String status, String kept) {
        ModelCapabilityRun run = benchmarkRun();
        when(aiStatus.load("qwen3:8b", BenchmarkSuite.LOAD_BUDGET)).thenThrow(failure);

        ModelBenchmarkResponse.LoadResult result = service.load("acme", 7L, 9L);

        assertThat(result.status()).isEqualTo(status);
        assertThat(run.getLoadProblem()).isEqualTo(kept);
    }

    static Stream<Arguments> loadProblems() {
        return Stream.of(
            Arguments.of(new ModelProviderException.TimedOut("late", null), "too_slow", "too_slow"),
            Arguments.of(new ModelProviderException("refused"), "failed", "failed"),
            Arguments.of(new ModelProviderException.Unreachable("gone", null), "unreachable", null));
    }

    @Test
    @DisplayName("une IA qui ne répond plus dit quoi faire, sans rien retenir sur le modèle")
    void anUnreachableAiSaysWhatToDo() {
        benchmarkRun();
        when(aiStatus.load("qwen3:8b", BenchmarkSuite.LOAD_BUDGET)).thenThrow(new ModelProviderException.Unreachable("gone", null));

        assertThat(service.load("acme", 7L, 9L).message()).contains("Check that it is running");
        verify(runs, never()).save(any());
    }

    @Test
    @DisplayName("un cas déjà joué rend sa note ; une autre version, un autre espace ou une mesure de capacité sont refusés")
    void aCaseIsPlayedOnce() throws Exception {
        benchmarkRun();
        ModelCapabilityResult done = ModelCapabilityResult.builder().id(55L).runId(9L).caseKey("summarize-thin-fr").capability("summarize")
            .passed(true).details(JSON.writeValueAsString(new ModelBenchmarkService.Details(List.of(), List.of(), "ok", "qwen3:8b", 12))).durationMs(1200L)
            .createdAt(AT).build();
        when(results.findByRunIdAndCaseKey(9L, "summarize-thin-fr")).thenReturn(Optional.of(done));
        assertThat(service.play("acme", 7L, 9L, "summarize-thin-fr").durationMs()).isEqualTo(1200L);
        verify(agent, never()).answerFrom(any(), anyString(), any(), anyString());

        assertThatThrownBy(() -> service.play("acme", 7L, 9L, "missing")).isInstanceOf(ResourceNotFoundException.class);

        ModelCapabilityRun capability = ModelCapabilityRun.builder().id(10L).workspaceId(1L).model("qwen3:8b").suite(ModelCapabilityRun.CAPABILITY).suiteVersion(1).build();
        when(runs.findByIdAndWorkspaceId(10L, 1L)).thenReturn(Optional.of(capability));
        assertThatThrownBy(() -> service.play("acme", 7L, 10L, "summarize-thin-fr")).isInstanceOf(ResourceNotFoundException.class);

        when(runs.findByIdAndWorkspaceId(11L, 1L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.play("acme", 7L, 11L, "summarize-thin-fr")).isInstanceOf(ResourceNotFoundException.class);

        ModelCapabilityRun older = ModelCapabilityRun.builder().id(12L).workspaceId(1L).model("qwen3:8b").suite(BenchmarkSuite.SUITE)
            .suiteVersion(BenchmarkSuite.VERSION - 1).build();
        when(runs.findByIdAndWorkspaceId(12L, 1L)).thenReturn(Optional.of(older));
        when(results.findByRunIdAndCaseKey(12L, "summarize-thin-fr")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.play("acme", 7L, 12L, "summarize-thin-fr")).isInstanceOf(BusinessException.class);
    }

    // -------------------------------------------------------------------------
    // Le détail, et le verdict de la personne
    // -------------------------------------------------------------------------

    private ModelCapabilityResult stored(long id, long runId, String caseKey, boolean passed, Boolean person, Long personId) throws Exception {
        return ModelCapabilityResult.builder().id(id).runId(runId).caseKey(caseKey).capability(caseKey.split("-")[0]).passed(passed)
            .details(JSON.writeValueAsString(new ModelBenchmarkService.Details(
                List.of(new EvalGrader.Check("a check", passed, "seen")), List.of(), "The answer.", "qwen3:8b", 12)))
            .durationMs(1500L).personPassed(person).personId(personId).createdAt(AT).build();
    }

    @Test
    @DisplayName("le détail : par tâche et par cas, la réponse, le temps, les critères, et les cas pas encore joués")
    void theDetail() throws Exception {
        played.add(ModelCapabilityRun.builder().id(1L).model("qwen3:8b").suite(BenchmarkSuite.SUITE).suiteVersion(BenchmarkSuite.VERSION).startedAt(AT).build());
        notes.add(new Row(100L, 1L, "summarize-thin-fr", true, 1500L, null, null, AT));
        when(results.findAllById(anyList())).thenReturn(List.of(stored(100L, 1L, "summarize-thin-fr", true, null, null)));

        ModelDetail detail = service.detail("acme", 7L, "qwen3:8b");

        assertThat(detail.current()).isTrue();
        assertThat(detail.lastRunAt()).isEqualTo(AT);
        assertThat(detail.tasks()).hasSize(7);
        ModelBenchmarkResponse.TaskDetail summarize = detail.tasks().get(0);
        assertThat(summarize.verdict()).isNull();
        assertThat(summarize.measured()).isEqualTo(1);
        ModelBenchmarkResponse.CaseDetail played = summarize.cases().stream().filter(c -> c.caseKey().equals("summarize-thin-fr")).findFirst().orElseThrow();
        assertThat(played.resultId()).isEqualTo(100L);
        assertThat(played.answer()).isEqualTo("The answer.");
        assertThat(played.durationMs()).isEqualTo(1500L);
        assertThat(played.checks()).hasSize(1);
        ModelBenchmarkResponse.CaseDetail unplayed = summarize.cases().stream().filter(c -> c.caseKey().equals("summarize-thread-fr")).findFirst().orElseThrow();
        assertThat(unplayed.resultId()).isNull();
        assertThat(unplayed.title()).isNotBlank();
    }

    static Stream<Arguments> overturns() {
        return Stream.of(
            Arguments.of(Boolean.TRUE, 7L),
            Arguments.of(Boolean.FALSE, 7L),
            Arguments.of(null, null));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("overturns")
    @DisplayName("retourner une note : réussi, raté, ou null pour la rendre au code ; dans l'espace seulement")
    void overturningACase(Boolean passed, Long person) throws Exception {
        ModelCapabilityResult result = stored(55L, 9L, "summarize-thin-fr", false, Boolean.FALSE, 8L);
        benchmarkRun();
        when(results.findById(55L)).thenReturn(Optional.of(result));
        when(results.save(result)).thenReturn(result);

        service.overturn("acme", 7L, 55L, passed);

        assertThat(result.getPersonPassed()).isEqualTo(passed);
        assertThat(result.getPersonId()).isEqualTo(person);
        assertThat(result.getPersonAt() == null).isEqualTo(passed == null);
        assertThat(result.isPassed()).isFalse();
    }

    @Test
    @DisplayName("un cas trop lent n'a pas de réponse à juger : sa note ne se retourne pas")
    void aCaseTooSlowCannotBeOverturned() throws Exception {
        ModelCapabilityResult result = stored(55L, 9L, "summarize-thin-fr", false, null, null);
        result = ModelCapabilityResult.builder().id(55L).runId(9L).caseKey("summarize-thin-fr").capability("summarize").passed(false)
            .details(result.getDetails()).tooSlow(true).createdAt(AT).build();
        benchmarkRun();
        when(results.findById(55L)).thenReturn(Optional.of(result));

        assertThatThrownBy(() -> service.overturn("acme", 7L, 55L, true)).isInstanceOf(BusinessException.class).hasMessageContaining("no answer to judge");
        verify(results, never()).save(any());
    }

    @Test
    @DisplayName("retourner une note d'un autre espace : introuvable, rien ne change")
    void overturningElsewhere() throws Exception {
        ModelCapabilityResult result = stored(55L, 99L, "summarize-thin-fr", false, null, null);
        when(results.findById(55L)).thenReturn(Optional.of(result));
        when(runs.findByIdAndWorkspaceId(99L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.overturn("acme", 7L, 55L, true)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.overturn("acme", 7L, 56L, true)).isInstanceOf(ResourceNotFoundException.class);
        verify(results, never()).save(any());
    }

    // -------------------------------------------------------------------------
    // L'essai à l'aveugle
    // -------------------------------------------------------------------------

    private void readsTheIssue() {
        lenient().when(material.read(any(), any(), anyList(), anyBoolean()))
            .thenReturn(new IssueMaterial.Read("OPS-35 issue text\n", List.of(new AssistantRead.IssueRead("OPS-35", 2))));
    }

    private void savesTrials(List<ModelBlindTrialAnswer> saved) {
        when(trials.save(any())).thenAnswer(call -> {
            ModelBlindTrial trial = call.getArgument(0);
            trial.setId(4L);
            return trial;
        });
        lenient().when(trialAnswers.save(any())).thenAnswer(call -> {
            saved.add(call.getArgument(0));
            return call.getArgument(0);
        });
    }

    @Test
    @DisplayName("ouvrir un essai : les modèles sous des lettres, aucun nom ne sort, et l'issue est lue avec les droits de la personne")
    void aTrialStarts() {
        readsTheIssue();
        List<ModelBlindTrialAnswer> saved = new ArrayList<>();
        savesTrials(saved);

        ModelBenchmarkResponse.TrialStarted started = service.startTrial("acme", 7L, 3L, 4L, "summarize", List.of("qwen3:8b", "qwen3:14b", "qwen3:8b"));

        assertThat(started.letters()).containsExactly("A", "B");
        assertThat(started.issueKey()).isEqualTo("OPS-35");
        assertThat(started.toString()).doesNotContain("qwen3");
        assertThat(saved).extracting(ModelBlindTrialAnswer::getModel).containsExactlyInAnyOrder("qwen3:8b", "qwen3:14b");
        assertThat(saved).extracting(ModelBlindTrialAnswer::getAnswer).containsOnlyNulls();
        ArgumentCaptor<List<Screen>> joined = ArgumentCaptor.forClass(List.class);
        verify(material).read(any(), any(), joined.capture(), eq(true));
        assertThat(joined.getValue()).containsExactly(new Screen(3L, 4L));
    }

    static Stream<Arguments> refusedTrials() {
        return Stream.of(
            Arguments.of("act", List.of("qwen3:8b", "qwen3:14b")),      // pas une tâche qui s'essaie
            Arguments.of("nope", List.of("qwen3:8b", "qwen3:14b")),
            Arguments.of("summarize", List.of()),                        // aucun modèle
            Arguments.of("summarize", List.of("qwen3:8b", "qwen3:14b", "qwen3.5:9b", "qwen3:14b", "qwen2")),  // non servi
            Arguments.of("summarize", List.of("qwen3:8b", "gone")));
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("refusedTrials")
    @DisplayName("un essai se fait sur une tâche permise, avec un à trois modèles servis")
    void refusedTrials(String task, List<String> models) {
        assertThatThrownBy(() -> service.startTrial("acme", 7L, 3L, 4L, task, models)).isInstanceOf(BusinessException.class);
        verify(trials, never()).save(any());
    }

    @Test
    @DisplayName("une issue que la personne ne voit pas : introuvable, aucun essai ne s'ouvre")
    void anIssueSheCannotRead() {
        when(material.read(any(), any(), anyList(), anyBoolean())).thenReturn(IssueMaterial.Read.NOTHING);

        assertThatThrownBy(() -> service.startTrial("acme", 7L, 3L, 4L, "summarize", List.of("qwen3:8b", "qwen3:14b")))
            .isInstanceOf(ResourceNotFoundException.class);
        verify(trials, never()).save(any());
    }

    private ModelBlindTrial trial(LocalDateTime decidedAt, String chosen) {
        ModelBlindTrial trial = ModelBlindTrial.builder().id(4L).workspaceId(1L).userId(7L).projectId(3L).issueId(40L).issueKey("OPS-35").task("triage")
            .startedAt(AT).decidedAt(decidedAt).chosenLetter(chosen).build();
        lenient().when(trials.findByIdAndWorkspaceIdAndUserId(4L, 1L, 7L)).thenReturn(Optional.of(trial));
        return trial;
    }

    private static ModelBlindTrialAnswer letter(String letter, String model, String answer) {
        return ModelBlindTrialAnswer.builder().id(1L).trialId(4L).letter(letter).model(model).answer(answer).durationMs(answer == null ? null : 3000L).build();
    }

    @Test
    @DisplayName("faire répondre une lettre : sans outil, le tableau et l'issue relus, le modèle jamais nommé, rien d'écrit sur l'issue")
    void aLetterAnswers() {
        trial(null, null);
        readsTheIssue();
        when(screens.attached(any(), eq(3L))).thenReturn(new ScreenContext.Seen("The board", "OPS", 5, null));
        IssueTypeResponse bug = new IssueTypeResponse();
        bug.setName("Bug");
        ProjectLabelResponse ui = new ProjectLabelResponse();
        ui.setName("ui");
        when(issues.listTypes("acme", 3L, 7L)).thenReturn(List.of(bug));
        when(projects.listLabels("acme", 3L, 7L)).thenReturn(List.of(ui));
        ModelBlindTrialAnswer a = letter("A", "qwen3:14b", null);
        when(trialAnswers.findByTrialIdAndLetter(4L, "A")).thenReturn(Optional.of(a));
        when(agent.answerFrom(anyString(), anyString(), any(), eq("qwen3:14b"))).thenReturn(ANSWERED);
        when(trialAnswers.save(any())).thenAnswer(call -> call.getArgument(0));

        ModelBenchmarkResponse.TrialLetterAnswer answered = service.playTrial("acme", 7L, 4L, "A");

        assertThat(answered.answer()).isEqualTo("Une réponse.");
        assertThat(answered.durationMs()).isNotNull();
        assertThat(answered.toString()).doesNotContain("qwen3");
        ArgumentCaptor<String> read = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> asked = ArgumentCaptor.forClass(String.class);
        verify(agent).answerFrom(read.capture(), asked.capture(), any(), eq("qwen3:14b"));
        assertThat(read.getValue()).startsWith("The board").contains("OPS-35 issue text");
        assertThat(asked.getValue()).contains("Triage").contains("Bug").contains("ui");
        verify(agent, never()).replay(any(), any(), anyString());
        verify(aiUsage).assertWithinQuota(1L);
        verify(aiUsage).record(eq(1L), any());
    }

    @Test
    @DisplayName("un essai à un seul modèle : une lettre, aucun choix à faire, il se referme à sa réponse")
    void aTrialWithOneModel() {
        readsTheIssue();
        List<ModelBlindTrialAnswer> saved = new ArrayList<>();
        savesTrials(saved);
        assertThat(service.startTrial("acme", 7L, 3L, 4L, "summarize", List.of("qwen3:8b")).letters()).containsExactly("A");

        ModelBlindTrial open = trial(null, null);
        ModelBlindTrialAnswer alone = letter("A", "qwen3:8b", null);
        when(trialAnswers.findByTrialIdAndLetter(4L, "A")).thenReturn(Optional.of(alone));
        when(trialAnswers.findByTrialIdOrderByLetterAsc(4L)).thenReturn(List.of(alone));
        when(agent.answerFrom(anyString(), anyString(), any(), eq("qwen3:8b"))).thenReturn(ANSWERED);

        assertThat(service.playTrial("acme", 7L, 4L, "A").answer()).isEqualTo("Une réponse.");
        assertThat(open.getDecidedAt()).isNotNull();
    }

    @Test
    @DisplayName("une lettre trop lente : rien à lire, et l'essai continue")
    void aLetterTooSlow() {
        trial(null, null);
        readsTheIssue();
        when(screens.attached(any(), eq(3L))).thenReturn(new ScreenContext.Seen("The board", "OPS", 5, null));
        ModelBlindTrialAnswer a = letter("A", "qwen3:14b", null);
        when(trialAnswers.findByTrialIdAndLetter(4L, "A")).thenReturn(Optional.of(a));
        when(trialAnswers.findByTrialIdOrderByLetterAsc(4L)).thenReturn(List.of(a, letter("B", "qwen3:8b", null)));
        when(agent.answerFrom(anyString(), anyString(), any(), eq("qwen3:14b"))).thenThrow(new LlmTimedOutException("late", null));

        ModelBenchmarkResponse.TrialLetterAnswer answered = service.playTrial("acme", 7L, 4L, "A");

        assertThat(answered.tooSlow()).isTrue();
        assertThat(answered.answer()).isEmpty();
        assertThat(a.isTooSlow()).isTrue();
        assertThat(service.playTrial("acme", 7L, 4L, "A").tooSlow()).as("relue, elle le dit encore").isTrue();
    }

    @Test
    @DisplayName("une panne pendant un essai se dit, sans 500")
    void aTrialFailureSaysSo() {
        trial(null, null);
        readsTheIssue();
        when(screens.attached(any(), eq(3L))).thenReturn(new ScreenContext.Seen("The board", "OPS", 5, null));
        when(trialAnswers.findByTrialIdAndLetter(4L, "A")).thenReturn(Optional.of(letter("A", "qwen3:14b", null)));
        when(agent.answerFrom(anyString(), anyString(), any(), eq("qwen3:14b"))).thenThrow(new AiGatewayClient.LlmException("down", null));

        assertThatThrownBy(() -> service.playTrial("acme", 7L, 4L, "A")).isInstanceOf(BusinessException.class).hasMessageContaining("stopped answering");
    }

    @Test
    @DisplayName("une réponse déjà donnée ne se rejoue pas ; un essai tranché non plus ; l'essai d'une autre personne n'existe pas")
    void aLetterIsPlayedOnce() {
        ModelBlindTrial open = trial(null, null);
        when(trialAnswers.findByTrialIdAndLetter(4L, "A")).thenReturn(Optional.of(letter("A", "qwen3:14b", "Déjà là.")));
        assertThat(service.playTrial("acme", 7L, 4L, "A").answer()).isEqualTo("Déjà là.");
        verify(agent, never()).answerFrom(any(), anyString(), any(), anyString());

        when(trialAnswers.findByTrialIdAndLetter(4L, "B")).thenReturn(Optional.of(letter("B", "qwen3:8b", null)));
        open.setDecidedAt(AT);
        assertThatThrownBy(() -> service.playTrial("acme", 7L, 4L, "B")).isInstanceOf(BusinessException.class);

        assertThatThrownBy(() -> service.playTrial("acme", 7L, 4L, "Z")).isInstanceOf(ResourceNotFoundException.class);

        when(trials.findByIdAndWorkspaceIdAndUserId(4L, 1L, 8L)).thenReturn(Optional.empty());
        when(access.resolveAndAuthorize("acme", 8L)).thenReturn(Workspace.builder().id(1L).slug("acme").build());
        assertThatThrownBy(() -> service.playTrial("acme", 8L, 4L, "A")).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.chooseTrial("acme", 8L, 4L, "A")).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("choisir : les noms apparaissent, une seule fois ; aucune lettre est un choix ; tant qu'une réponse manque, on attend")
    void choosing() {
        ModelBlindTrial open = trial(null, null);
        when(trials.save(any())).thenAnswer(call -> call.getArgument(0));
        when(trialAnswers.findByTrialIdOrderByLetterAsc(4L)).thenReturn(List.of(letter("A", "qwen3:14b", "un"), letter("B", "qwen3:8b", "deux")));

        ModelBenchmarkResponse.TrialResult result = service.chooseTrial("acme", 7L, 4L, "B");

        assertThat(result.chosenLetter()).isEqualTo("B");
        assertThat(result.chosenModel()).isEqualTo("qwen3:8b");
        assertThat(result.answers()).extracting(ModelBenchmarkResponse.TrialAnswer::model).containsExactly("qwen3:14b", "qwen3:8b");
        assertThat(open.getDecidedAt()).isNotNull();

        // Une seconde fois : le premier choix compte.
        assertThat(service.chooseTrial("acme", 7L, 4L, "A").chosenLetter()).isEqualTo("B");

        ModelBlindTrial none = trial(null, null);
        ModelBenchmarkResponse.TrialResult neither = service.chooseTrial("acme", 7L, 4L, null);
        assertThat(neither.chosenLetter()).isNull();
        assertThat(neither.chosenModel()).isNull();
        assertThat(none.getDecidedAt()).isNotNull();

        trial(null, null);
        assertThatThrownBy(() -> service.chooseTrial("acme", 7L, 4L, "Z")).isInstanceOf(ResourceNotFoundException.class);

        trial(null, null);
        when(trialAnswers.findByTrialIdOrderByLetterAsc(4L)).thenReturn(List.of(letter("A", "qwen3:14b", "un"), letter("B", "qwen3:8b", null)));
        assertThatThrownBy(() -> service.chooseTrial("acme", 7L, 4L, "A")).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("le détail montre les essais tranchés de la personne où ce modèle a répondu, jamais ceux d'une autre")
    void theTrialsInTheDetail() {
        ModelBlindTrial mine = ModelBlindTrial.builder().id(4L).workspaceId(1L).userId(7L).projectId(3L).issueId(40L).issueKey("OPS-35").task("summarize")
            .startedAt(AT).decidedAt(AT).chosenLetter("A").build();
        ModelBlindTrial other = ModelBlindTrial.builder().id(5L).workspaceId(1L).userId(7L).projectId(3L).issueId(41L).issueKey("OPS-36").task("plan")
            .startedAt(AT).decidedAt(AT).build();
        when(trials.findTop30ByWorkspaceIdAndUserIdAndDecidedAtIsNotNullOrderByDecidedAtDesc(1L, 7L)).thenReturn(List.of(mine, other));
        ModelBlindTrialAnswer a = letter("A", "qwen3:14b", "un");
        ModelBlindTrialAnswer b = letter("B", "qwen3:8b", "deux");
        ModelBlindTrialAnswer c = ModelBlindTrialAnswer.builder().trialId(5L).letter("A").model("qwen3.5:9b").answer("trois").build();
        when(trialAnswers.findByTrialIdInOrderByLetterAsc(anyCollection())).thenReturn(List.of(a, b, c));

        ModelDetail detail = service.detail("acme", 7L, "qwen3:8b");

        assertThat(detail.trials()).singleElement().satisfies(trial -> {
            assertThat(trial.issueKey()).isEqualTo("OPS-35");
            assertThat(trial.chosenModel()).isEqualTo("qwen3:14b");
            assertThat(trial.answers()).hasSize(2);
        });
        verify(trials).findTop30ByWorkspaceIdAndUserIdAndDecidedAtIsNotNullOrderByDecidedAtDesc(1L, 7L);
    }

    @Test
    @DisplayName("la conso qui ne se compte pas n'arrête pas un cas")
    void aFailedMeterDoesNotStopACase() {
        benchmarkRun();
        savesResults();
        when(agent.answerFrom(any(), anyString(), any(), anyString())).thenReturn(ANSWERED);
        org.mockito.Mockito.doThrow(new RuntimeException("db")).when(aiUsage).record(any(), any());

        assertThat(service.play("acme", 7L, 9L, "summarize-thin-fr")).isNotNull();
    }

    /** Une garantie de lecture : la liste des notes d'un passage tient dans ce que la matrice lit. */
    @Test
    @DisplayName("sans passage, la matrice est vide de verdicts et ne lit pas les notes")
    void noRunNoNotes() {
        assertThat(service.matrix("acme", 7L).models()).allSatisfy(row -> {
            assertThat(row.lastRunAt()).isNull();
            assertThat(row.cells()).allSatisfy(cell -> assertThat(cell.verdict()).isNull());
        });
        verify(results, never()).findBenchmarkRowsByRunIdIn(any(Collection.class));
    }
}
