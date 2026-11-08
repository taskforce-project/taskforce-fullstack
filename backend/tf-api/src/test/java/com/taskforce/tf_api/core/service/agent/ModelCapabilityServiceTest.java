package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.ChatTurnResponse;
import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse;
import com.taskforce.tf_api.core.model.AiModelChoice;
import com.taskforce.tf_api.core.model.ModelCapabilityResult;
import com.taskforce.tf_api.core.model.ModelCapabilityRun;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AiModelChoiceRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityResultRepository;
import com.taskforce.tf_api.core.repository.ModelCapabilityRunRepository;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Ce que sait faire chaque modèle (R113) et la proposition d'un modèle plus fort (R118) : la table lit la dernière note de
 * chaque cas pour les modèles servis, TaskForce propose le premier capable, une mesure note un cas une fois, et la
 * proposition n'apparaît que quand la banque dit que le modèle de Cortex échoue au genre de la demande.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Ce que sait faire chaque modèle")
class ModelCapabilityServiceTest {

    private static final LocalDateTime MEASURED = LocalDateTime.of(2026, 11, 4, 10, 0);
    private static final List<String> SERVED = List.of("qwen2.5:7b-instruct", "bge-m3:latest", "qwen3:8b", "qwen3:14b");

    @Mock private com.taskforce.tf_api.core.service.brain.BrainAccessGuard access;
    @Mock private AiStatusService aiStatus;
    @Mock private AgentService agent;
    @Mock private AiUsageService aiUsage;
    @Mock private ModelCapabilityRunRepository runs;
    @Mock private ModelCapabilityResultRepository results;
    @Mock private AiModelChoiceRepository choices;

    @InjectMocks private ModelCapabilityService service;

    /** Une note telle que la table la lit. */
    private record Row(Long getRunId, String getCaseKey, Boolean getPassed, LocalDateTime getCreatedAt)
        implements ModelCapabilityResultRepository.Row {
    }

    private final List<ModelCapabilityRun> measured = new ArrayList<>();
    private final List<ModelCapabilityResultRepository.Row> notes = new ArrayList<>();

    @BeforeEach
    void instance() {
        lenient().when(access.resolveAndAuthorize("acme", 7L)).thenReturn(Workspace.builder().id(1L).slug("acme").build());
        AiProviderSettings settings = AiProviderSettings.from(Map.of("AI_PROVIDER", "ollama")::get);
        AiStatusService.AiStatus status = new AiStatusService.AiStatus(true, true, "qwen3:8b", "qwen3:8b", true, "bge-m3");
        lenient().when(aiStatus.snapshot()).thenReturn(new AiStatusService.Snapshot(settings, status, true, SERVED, SERVED));
        lenient().when(aiStatus.current()).thenReturn(status);
        lenient().when(runs.findTop500BySuiteAndSuiteVersionOrderByStartedAtDesc(ModelCapabilityRun.CAPABILITY, CapabilitySuite.VERSION)).thenReturn(measured);
        lenient().when(results.findRowsByRunIdIn(anyCollection())).thenReturn(notes);
        lenient().when(choices.findById(7L)).thenReturn(Optional.empty());
    }

    /** Une mesure de {@code model} : chaque cas nommé réussi, les autres de {@code failed} échoués, à {@code at}. */
    private void measure(long runId, String model, LocalDateTime at, List<String> failed) {
        measured.add(ModelCapabilityRun.builder().id(runId).model(model).suiteVersion(CapabilitySuite.VERSION)
            .startedAt(at).total(CapabilitySuite.cases().size()).build());
        for (CapabilitySuite.CapabilityCase c : CapabilitySuite.cases()) {
            notes.add(new Row(runId, c.key(), !failed.contains(c.key()), at));
        }
    }

    private static ModelCapabilityResponse.Score cell(ModelCapabilityResponse table, String model, String capability) {
        return table.models().stream().filter(row -> row.model().equals(model)).findFirst().orElseThrow()
            .scores().stream().filter(score -> score.capability().equals(capability)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("la table : les modèles de conversation servis, les préférences d'abord, la dernière note de chaque cas")
    void tableReadsTheLatestNotes() {
        measure(1L, "qwen3:8b", MEASURED.minusDays(1), List.of("tools-move", "tools-list"));
        measure(2L, "qwen3:8b", MEASURED, List.of("context-long"));
        measure(3L, "qwen2.5:7b-instruct", MEASURED, List.of("tools-move", "french-read"));

        ModelCapabilityResponse table = service.table("acme", 7L);

        assertThat(table.models()).extracting(ModelCapabilityResponse.ModelRow::model)
            .containsExactly("qwen3:8b", "qwen2.5:7b-instruct", "qwen3:14b");
        assertThat(table.provider()).isEqualTo("OLLAMA");
        assertThat(table.current()).isEqualTo("qwen3:8b");
        assertThat(table.models().get(0).current()).isTrue();
        assertThat(table.models().get(0).measuredAt()).isEqualTo(MEASURED);
        // Le nouveau rejeu de qwen3:8b réussit les outils : sa dernière note compte, pas celle de la veille.
        assertThat(cell(table, "qwen3:8b", "tools").capable()).isTrue();
        ModelCapabilityResponse.Score context = cell(table, "qwen3:8b", "context");
        assertThat(context.passed()).isEqualTo(1);
        assertThat(context.capable()).isFalse();
        assertThat(context.heldWords()).isEqualTo(CapabilitySuite.SHORT_DOCUMENT);
        assertThat(cell(table, "qwen2.5:7b-instruct", "tools").passed()).isEqualTo(1);
        assertThat(cell(table, "qwen3:14b", "tools").measured()).isZero();
        assertThat(cell(table, "qwen3:14b", "context").heldWords()).isNull();
        // Le premier capable, dans l'ordre de la table ; personne ne tient le long contexte.
        assertThat(table.proposals()).extracting(ModelCapabilityResponse.Proposal::capability, ModelCapabilityResponse.Proposal::model)
            .contains(org.assertj.core.groups.Tuple.tuple("tools", "qwen3:8b"), org.assertj.core.groups.Tuple.tuple("french", "qwen3:8b"))
            .doesNotContain(org.assertj.core.groups.Tuple.tuple("context", "qwen3:8b"));
        assertThat(table.proposed()).isNull();
        assertThat(table.cases()).hasSize(CapabilitySuite.cases().size());
        assertThat(table.capabilities()).extracting(ModelCapabilityResponse.CapabilityInfo::key)
            .containsExactly("tools", "context", "code", "french", "english");
    }

    @Test
    @DisplayName("chaque ligne dit quels cas sont ratés à leur dernière note, dans l'ordre de la suite (R130)")
    void rowsSayWhichCasesFailed() {
        measure(1L, "qwen3:8b", MEASURED.minusDays(1), List.of("tools-move", "tools-list"));
        measure(2L, "qwen3:8b", MEASURED, List.of("french-read", "context-long"));

        ModelCapabilityResponse table = service.table("acme", 7L);

        // La mesure d'hier ratait les outils : sa dernière note les réussit, ils ne sont plus ratés.
        assertThat(table.models().get(0).failedCases()).containsExactly("context-long", "french-read");
        assertThat(table.models().stream().filter(row -> row.model().equals("qwen3:14b")).findFirst().orElseThrow().failedCases())
            .as("un modèle pas mesuré n'a rien de raté").isEmpty();
    }

    @Test
    @DisplayName("chaque ligne porte ce que dit la fiche du modèle chez son fournisseur, et rien quand elle ne dit rien")
    void rowsCarryTheModelCard() {
        ModelGateway.ModelCard described = new ModelGateway.ModelCard("14.8B", 40960, true);
        when(aiStatus.describe(anyString()))
            .thenAnswer(call -> "qwen3:14b".equals(call.getArgument(0)) ? Optional.of(described) : Optional.empty());

        ModelCapabilityResponse table = service.table("acme", 7L);

        ModelCapabilityResponse.ModelRow unmeasured = table.models().stream()
            .filter(row -> row.model().equals("qwen3:14b")).findFirst().orElseThrow();
        assertThat(unmeasured.measuredAt()).isNull();
        assertThat(unmeasured.card()).isEqualTo(new ModelCapabilityResponse.Card("14.8B", 40960, true));
        // Une fiche n'est pas une mesure : la cellule reste « non mesurée ».
        assertThat(cell(table, "qwen3:14b", "tools").measured()).isZero();
        assertThat(table.models().get(0).card()).isNull();
    }

    @Test
    @DisplayName("une mesure s'ouvre sur un modèle servi, avec les cas de la suite ; un autre nom dit lesquels le sont")
    void startNeedsAServedModel() {
        when(runs.save(any())).thenAnswer(call -> {
            ModelCapabilityRun run = call.getArgument(0);
            run.setId(9L);
            return run;
        });

        ModelCapabilityResponse.RunStarted started = service.start("acme", 7L, " qwen3:14b ");

        assertThat(started.runId()).isEqualTo(9L);
        assertThat(started.model()).isEqualTo("qwen3:14b");
        assertThat(started.cases()).hasSize(CapabilitySuite.cases().size()).startsWith("tools-move");
        assertThatThrownBy(() -> service.start("acme", 7L, "llama3.1:70b"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("qwen3:8b, qwen2.5:7b-instruct, qwen3:14b");
        assertThatThrownBy(() -> service.start("acme", 7L, "bge-m3:latest")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.start("acme", 7L, " ")).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("un cas se rejoue sur le modèle de la mesure, sous le quota, se note par du code, une seule fois")
    void measureGradesACaseOnce() {
        ModelCapabilityRun run = ModelCapabilityRun.builder().id(9L).workspaceId(1L).model("qwen3:14b")
            .suiteVersion(CapabilitySuite.VERSION).total(CapabilitySuite.cases().size()).build();
        when(runs.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(run));
        when(results.findByRunIdAndCaseKey(9L, "code-js-sort")).thenReturn(Optional.empty());
        when(agent.replay(any(), any(), eq("qwen3:14b")))
            .thenReturn(new ReplayOutcome("It prints 1,10,9.", List.of(), "qwen3:14b", new LlmUsage(3100, 12, 3112)));
        when(results.save(any())).thenAnswer(call -> call.getArgument(0));
        when(results.countByRunIdAndPassedTrue(9L)).thenReturn(1L);
        when(results.countByRunId(9L)).thenReturn(1L);

        ModelCapabilityResponse.CaseResult result = service.measure("acme", 7L, 9L, "code-js-sort");

        assertThat(result.passed()).isTrue();
        assertThat(result.capability()).isEqualTo("code");
        assertThat(result.promptTokens()).isEqualTo(3100);
        verify(aiUsage).assertWithinQuota(1L);
        verify(aiUsage).record(eq(1L), any());
        ArgumentCaptor<ModelCapabilityResult> saved = ArgumentCaptor.forClass(ModelCapabilityResult.class);
        verify(results).save(saved.capture());
        assertThat(saved.getValue().getDetails()).contains("\"promptTokens\":3100");
        assertThat(run.getPassed()).isEqualTo(1);
        assertThat(run.getFinishedAt()).isNull();

        // Déjà noté : la note gardée revient, sans rejeu.
        when(results.findByRunIdAndCaseKey(9L, "code-js-sort")).thenReturn(Optional.of(saved.getValue()));
        assertThat(service.measure("acme", 7L, 9L, "code-js-sort").passed()).isTrue();
        verify(agent).replay(any(), any(), eq("qwen3:14b"));
    }

    @Test
    @DisplayName("le fournisseur refuse les outils de Cortex pour ce modèle (un modèle de base) : le cas est noté échoué, pas en panne")
    void aModelWithoutToolsFailsTheCase() {
        ModelCapabilityRun run = ModelCapabilityRun.builder().id(9L).workspaceId(1L).model("qwen2.5-coder:7b-base")
            .suiteVersion(CapabilitySuite.VERSION).total(CapabilitySuite.cases().size()).build();
        when(runs.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(run));
        when(results.findByRunIdAndCaseKey(9L, "french-read")).thenReturn(Optional.empty());
        when(agent.replay(any(), any(), eq("qwen2.5-coder:7b-base")))
            .thenThrow(new com.taskforce.tf_api.core.service.LlmToolsRefusedException("The AI provider refused the tools", null));
        when(results.save(any())).thenAnswer(call -> call.getArgument(0));

        ModelCapabilityResponse.CaseResult result = service.measure("acme", 7L, 9L, "french-read");

        assertThat(result.passed()).isFalse();
        assertThat(result.checks()).singleElement().satisfies(check -> {
            assertThat(check.criterion()).isEqualTo("takes Cortex's tools");
            assertThat(check.detail()).contains("can't answer as Cortex");
        });
        assertThat(result.promptTokens()).isZero();
    }

    @Test
    @DisplayName("une mesure d'une autre version, un cas inconnu, une mesure d'un autre espace : rien ne se rejoue")
    void measureRefusesWhatItCannotGrade() {
        ModelCapabilityRun old = ModelCapabilityRun.builder().id(9L).workspaceId(1L).model("qwen3:8b").suiteVersion(0).build();
        when(runs.findByIdAndWorkspaceId(9L, 1L)).thenReturn(Optional.of(old));
        when(results.findByRunIdAndCaseKey(9L, "tools-move")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.measure("acme", 7L, 9L, "tools-move")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.measure("acme", 7L, 9L, "missing")).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.measure("acme", 7L, 8L, "tools-move")).isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(agent);
    }

    @Test
    @DisplayName("le choix de la personne : un modèle servi, qui répond à Cortex ; vide, celui de l'instance revient")
    void choiceIsAServedModel() {
        service.choose("acme", 7L, "qwen3:14b");
        ArgumentCaptor<AiModelChoice> chosen = ArgumentCaptor.forClass(AiModelChoice.class);
        verify(choices).save(chosen.capture());
        assertThat(chosen.getValue().getModel()).isEqualTo("qwen3:14b");

        AiModelChoice kept = AiModelChoice.builder().userId(7L).model("qwen3:14b").chosenAt(MEASURED).build();
        when(choices.findById(7L)).thenReturn(Optional.of(kept));
        assertThat(service.chosenModel(7L)).isEqualTo("qwen3:14b");
        assertThat(service.table("acme", 7L).current()).isEqualTo("qwen3:14b");
        service.choose("acme", 7L, "");
        verify(choices).delete(kept);

        // Un modèle qui n'est plus servi ne répond plus : Cortex revient à celui de l'instance.
        when(choices.findById(7L)).thenReturn(Optional.of(AiModelChoice.builder().userId(7L).model("gone:1b").build()));
        assertThat(service.chosenModel(7L)).isNull();
        assertThatThrownBy(() -> service.choose("acme", 7L, "gone:1b")).isInstanceOf(BusinessException.class);
        assertThat(service.requestedModel(null)).isNull();
        assertThat(service.requestedModel("qwen3:8b")).isEqualTo("qwen3:8b");
        assertThat(service.cortexModel(null)).isEqualTo("qwen3:8b");
        assertThat(service.cortexModel("qwen3:14b")).isEqualTo("qwen3:14b");
    }

    @Test
    @DisplayName("la banque dit que le modèle échoue aux outils : TaskForce propose le premier qui les réussit, et le dit")
    void offersTheFirstModelThatPasses() {
        measure(1L, "qwen2.5:7b-instruct", MEASURED, List.of("tools-move"));
        measure(2L, "qwen3:8b", MEASURED, List.of());

        Optional<ChatTurnResponse.Escalation> offer = service.offer("Move ATLAS-3 to Done.", List.of(), "qwen2.5:7b-instruct");

        assertThat(offer).isPresent();
        assertThat(offer.get().capability()).isEqualTo("tools");
        assertThat(offer.get().to()).isEqualTo("qwen3:8b");
        assertThat(offer.get().text()).isEqualTo("qwen2.5:7b-instruct failed 1 of 2 test cases for requests that use "
            + "TaskForce's tools on 4 November 2026; qwen3:8b passed them all. You can send this request to qwen3:8b.");
        assertThat(ModelCapabilityService.block(offer.get().text())).startsWith("\n\n> [!taskforce] TaskForce · models\n> ");
    }

    @Test
    @DisplayName("aucun modèle ne réussit tout le code : le plus fort mesuré reçoit la proposition, et la phrase dit sa note")
    void offersTheStrongestMeasuredModel() {
        measure(1L, "qwen3:8b", MEASURED, List.of("code-js-sort", "code-python-default"));
        measure(2L, "qwen2.5:7b-instruct", MEASURED, List.of("code-js-sort", "code-python-default"));
        measure(3L, "qwen3:14b", MEASURED, List.of("code-js-sort"));

        Optional<ChatTurnResponse.Escalation> offer = service.offer(
            "What does this print? ```js\nconsole.log([3, 20, 100].sort())\n```", List.of(), "qwen3:8b");

        assertThat(offer).isPresent();
        assertThat(offer.get().capability()).isEqualTo("code");
        assertThat(offer.get().to()).isEqualTo("qwen3:14b");
        assertThat(offer.get().text()).isEqualTo("qwen3:8b failed 2 of 2 test cases for questions about code on 4 November "
            + "2026; qwen3:14b passed 1 of 2. You can send this request to qwen3:14b.");
        // qwen3:14b fait moins bien sur rien : à lui, la banque ne propose personne.
        assertThat(service.offer("What does this print? ```js\nconsole.log(1)\n```", List.of(), "qwen3:14b")).isEmpty();
    }

    @Test
    @DisplayName("aucune proposition : le modèle réussit ce genre, n'est pas mesuré, ou aucun autre ne fait mieux")
    void noOfferWithoutAMeasuredFailure() {
        measure(1L, "qwen2.5:7b-instruct", MEASURED, List.of("french-read"));
        measure(2L, "qwen3:8b", MEASURED, List.of("french-read"));

        assertThat(service.offer("Move ATLAS-3 to Done.", List.of(), "qwen2.5:7b-instruct")).isEmpty();
        assertThat(service.offer("Bonjour, qui s'occupe des tests ?", List.of(), "qwen2.5:7b-instruct")).isEmpty();
        assertThat(service.offer("Move ATLAS-3 to Done.", List.of(), "qwen3:14b")).isEmpty();
        assertThat(service.offer("Move ATLAS-3 to Done.", List.of(), null)).isEmpty();
        verify(choices, never()).save(any());
    }

    @Test
    @DisplayName("une conversation plus longue que ce que le modèle a tenu : le premier qui a tenu assez")
    void offersALongerContext() {
        measure(1L, "qwen3:8b", MEASURED, List.of("context-long"));
        measure(2L, "qwen3:14b", MEASURED, List.of());
        List<Map<String, Object>> history = List.of(Map.of("role", "user", "content", "word ".repeat(900)));

        Optional<ChatTurnResponse.Escalation> offer = service.offer("ok", history, "qwen3:8b");

        assertThat(offer).isPresent();
        assertThat(offer.get().capability()).isEqualTo("context");
        assertThat(offer.get().to()).isEqualTo("qwen3:14b");
        assertThat(offer.get().text()).contains("about 901 words").contains("qwen3:8b held 500 words at most")
            .contains("qwen3:14b held 3,000");
        assertThat(service.offer("ok", List.of(), "qwen3:8b")).isEmpty();
    }
}
