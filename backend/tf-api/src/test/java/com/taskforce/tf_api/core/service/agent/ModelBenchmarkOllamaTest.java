package com.taskforce.tf_api.core.service.agent;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse;
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
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.ai.AiProviderConfig;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.FakeOllama;
import com.taskforce.tf_api.core.service.ai.ModelDeadline;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Le banc des modèles devant un Ollama qui répond comme celui du CEO le 16/11/2026 (Ollama 0.40.16) : qwen3:8b, le modèle que
 * nomment les réglages de l'IA, n'est plus installé ; mimo-v2.6:9b vient de l'être. Toute la chaîne d'un cas est la vraie, du banc
 * jusqu'au HTTP : AgentService, AiGatewayClient, AiStatusService, ModelGateway et le client du JDK. Seuls la base et les droits sont
 * simulés.
 */
@DisplayName("Le banc des modèles devant Ollama")
class ModelBenchmarkOllamaTest {

    private static final Long RUN = 9L;
    private static final String CODE_CASE = "code-pagination-ts";
    /** Ce qu'un modèle qui sait faire répond au cas du code : la fonction corrigée, dans un bloc de code. */
    private static final String FIXED = """
        ```ts
        export function pageOf<T>(items: T[], page: number, size: number): T[] {
          const start = (page - 1) * size;
          return items.slice(start, start + size);
        }
        ```""";

    private FakeOllama ollama;
    private ModelCapabilityRun run;
    private AiGatewayClient client;
    private ModelBenchmarkService service;
    private final ModelCapabilityResultRepository results = mock(ModelCapabilityResultRepository.class);

    @BeforeEach
    void theCeoMachine() throws Exception {
        ollama = new FakeOllama()
            .install("bge-m3:latest", null, 1_157_672_605L)
            .install("qwen3-embedding:0.6b", null, 639_150_858L)
            .install(FakeOllama.QWEN35, FakeOllama.QWEN35_SHOW, 6_594_474_711L)
            .install(FakeOllama.MIMO, FakeOllama.MIMO_SHOW, 6_550_811_033L)
            .loadsIn(300)
            .answers(FIXED, "The user wants the off-by-one fixed. The old code was const start = page * size; pages start at 1.");
        // Les réglages de l'app desktop ce jour-là : « models qwen3:8b / qwen3:8b » au journal du backend.
        AiProviderSettings settings = AiProviderSettings.from(Map.of("AI_PROVIDER", "ollama", "AI_BASE_URL", ollama.url() + "/v1",
            "AI_MODEL", "qwen3:8b", "AI_MODEL_FAST", "qwen3:8b")::get);
        ObjectMapper json = new ObjectMapper();
        ModelGateway gateway = new ModelGateway(json);
        AiStatusService status = new AiStatusService(gateway, new AiProviderConfig(settings));
        client = new AiGatewayClient(gateway, status);
        // Une réponse sans outil ne lit que le client du modèle : le reste de Cortex n'y sert pas.
        AgentService agent = new AgentService(null, null, null, client, json, null, null, null, null, null, null, null, null, null,
            null, null);

        BrainAccessGuard access = mock(BrainAccessGuard.class);
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(Workspace.builder().id(1L).slug("acme").build());
        ModelCapabilityRunRepository runs = mock(ModelCapabilityRunRepository.class);
        run = ModelCapabilityRun.builder().id(RUN).workspaceId(1L).model(FakeOllama.MIMO).suite(BenchmarkSuite.SUITE)
            .suiteVersion(BenchmarkSuite.VERSION).total(BenchmarkSuite.cases().size()).startedAt(LocalDateTime.now()).build();
        when(runs.findByIdAndWorkspaceId(RUN, 1L)).thenReturn(Optional.of(run));
        when(runs.save(any())).thenAnswer(call -> call.getArgument(0));
        when(results.findByRunIdAndCaseKey(any(), any())).thenReturn(Optional.empty());
        when(results.save(any())).thenAnswer(call -> {
            ModelCapabilityResult result = call.getArgument(0);
            result.setId(55L);
            return result;
        });
        service = new ModelBenchmarkService(access, status, agent, mock(AiUsageService.class), mock(ModelCapabilityService.class),
            mock(EvalService.class), new ModelCallStops(), mock(IssueMaterial.class), mock(ScreenContext.class),
            mock(ProjectService.class), mock(IssueService.class), runs, results, mock(ModelBlindTrialRepository.class),
            mock(ModelBlindTrialAnswerRepository.class));
    }

    @AfterEach
    void stopOllama() {
        ollama.close();
    }

    /**
     * Le 16/11/2026, deux fois : le chargement passe (5,01 s, puis 14,68 ms), puis « mimo-v2.6:9b stopped answering on this
     * machine ». Ollama n'a reçu aucune question : le client refusait l'appel avant de l'envoyer, parce que qwen3:8b, le modèle des
     * réglages, n'était plus servi. Le modèle nommé par le passage l'était.
     */
    @Test
    @DisplayName("le modèle des réglages désinstallé, un modèle installé se charge, répond, et son cas se note")
    void aServedModelIsGradedWhenTheInstanceModelIsGone() {
        ModelBenchmarkResponse.LoadResult loaded = service.load("acme", 7L, RUN);

        assertThat(loaded.status()).isEqualTo(ModelBenchmarkService.LOADED);
        assertThat(loaded.gpuBytes()).isEqualTo(6_400_000_000L);

        ModelBenchmarkResponse.CaseDetail graded = service.play("acme", 7L, RUN, CODE_CASE);

        assertThat(graded.passed()).as("checks: %s", graded.checks()).isTrue();
        assertThat(graded.answer()).isEqualTo(FIXED);
        assertThat(graded.durationMs()).isNotNull();
        assertThat(ollama.chats()).hasSize(2);
        assertThat(ollama.questions()).singleElement().satisfies(question -> {
            assertThat(question.body().path("model").asText()).isEqualTo(FakeOllama.MIMO);
            // La fenêtre du chargement, gardée : aucun cas ne paie un rechargement.
            assertThat(question.body().path("options").path("num_ctx").asInt()).isEqualTo(16_384);
        });
    }

    /**
     * Appelé à la main le 16/11/2026, mimo-v2.6:9b remplit {@code thinking} à côté de sa réponse tant qu'on ne lui dit pas
     * {@code think: false} : un Qwen3.5 sous un autre nom, que la passerelle ne reconnaissait qu'à un nom en « qwen3 ».
     */
    @Test
    @DisplayName("mimo-v2.6:9b, un Qwen3.5 sous un autre nom : sa fiche le dit, il répond sans raisonner, et sa réponse se note")
    void mimoAnswersWithoutThinking() {
        service.load("acme", 7L, RUN);

        ModelBenchmarkResponse.CaseDetail graded = service.play("acme", 7L, RUN, CODE_CASE);

        assertThat(graded.passed()).isTrue();
        assertThat(graded.answer()).isEqualTo(FIXED).doesNotContain("The user wants");
        assertThat(ollama.questions()).singleElement().satisfies(question -> {
            assertThat(question.body().path("think").isBoolean()).as("think is sent").isTrue();
            assertThat(question.body().path("think").asBoolean()).isFalse();
            assertThat(question.body().path("messages").path(1).path("content").asText()).doesNotContain("/no_think");
        });
    }

    @Test
    @DisplayName("« Stop » pendant que le modèle calcule : le cas s'arrête tout de suite, « Stopped », sans note")
    void aRealStopStaysStopped() throws Exception {
        ollama.holds();
        service.load("acme", 7L, RUN);
        CompletableFuture<ModelBenchmarkResponse.CaseDetail> playing =
            CompletableFuture.supplyAsync(() -> service.play("acme", 7L, RUN, CODE_CASE));
        assertThat(ollama.awaitQuestion(10)).isTrue();

        service.stop("acme", 7L);

        assertThatThrownBy(() -> playing.get(10, TimeUnit.SECONDS)).hasCauseInstanceOf(ModelCallStops.Stopped.class);
        verify(results, never()).save(any());
    }

    @Test
    @DisplayName("un vrai refus d'Ollama dit sa cause, en mots : le modèle ne tient pas en mémoire")
    void aRealFailureSaysItsCause() {
        service.load("acme", 7L, RUN);
        ollama.refuses(500, "{\"error\":\"model requires more system memory (7.2 GiB) than is available (1.8 GiB)\"}");

        assertThatThrownBy(() -> service.play("acme", 7L, RUN, CODE_CASE)).isInstanceOfSatisfying(BusinessException.class, failure -> {
            assertThat(failure.getErrorCode()).isEqualTo("MODEL_FAILED");
            assertThat(failure.getMessage()).isEqualTo("mimo-v2.6:9b doesn't fit in this machine's memory right now. Run it again, "
                + "or leave it out of the run.");
        });
        verify(results, never()).save(any());
    }

    @Test
    @DisplayName("Ollama arrêté au milieu du passage : le cas le dit, sans en accuser le modèle")
    void ollamaStopsDuringTheRun() {
        service.load("acme", 7L, RUN);
        ollama.close();

        assertThatThrownBy(() -> service.play("acme", 7L, RUN, CODE_CASE))
            .hasMessage("The AI doesn't answer. Check that it is running. Run it again, or leave it out of the run.");
        verify(results, never()).save(any());
    }

    @Test
    @DisplayName("un modèle qui ne répond pas dans le temps de son cas est trop lent, pas en panne")
    void aTimeoutStaysTooSlow() {
        ollama.holds();

        assertThatThrownBy(() -> ModelDeadline.within(Duration.ofMillis(1_500),
                () -> client.rawChatWithModel(List.of(Map.of("role", "user", "content", "q")), List.of(), FakeOllama.MIMO)))
            .isInstanceOf(LlmTimedOutException.class);
        assertThat(ollama.questions()).hasSize(1);
    }
}
