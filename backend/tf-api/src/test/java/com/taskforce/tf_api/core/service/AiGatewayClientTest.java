package com.taskforce.tf_api.core.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ChosenModel;
import com.taskforce.tf_api.core.service.ai.ModelDeadline;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.core.service.ai.ModelWindow;
import com.taskforce.tf_api.core.service.ai.ModelProviderException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** {@link AiGatewayClient} : le palier choisit le modèle, l'usage s'accumule, l'échec est immédiat sans IA. */
@DisplayName("AiGatewayClient")
class AiGatewayClientTest {

    private static final AiProviderSettings SETTINGS = AiProviderSettings.from(Map.<String, String>of()::get);
    private static final AiStatus READY = new AiStatus(true, true, "main", "fast-one", true, "e");

    private ModelGateway gateway;
    private AiStatusService status;
    private AiGatewayClient client;

    @BeforeEach
    void setUp() {
        gateway = mock(ModelGateway.class);
        status = mock(AiStatusService.class);
        ready(READY);
        client = new AiGatewayClient(gateway, status);
    }

    private void ready(AiStatus current) {
        when(status.current()).thenReturn(current);
        when(status.snapshot()).thenReturn(new AiStatusService.Snapshot(SETTINGS, current, true, List.of(), List.of()));
    }

    private static ModelGateway.ChatReply reply(String model, String content) {
        ObjectNode message = new ObjectMapper().createObjectNode().put("role", "assistant").put("content", content);
        return new ModelGateway.ChatReply(model, message, new LlmUsage(3, 2, 5));
    }

    @Test
    @DisplayName("un cas du banc : son budget remplace le délai général de l'IA, le temps de l'action")
    void theBudgetOfACaseReplacesTheTimeout() {
        ArgumentCaptor<AiProviderSettings> settings = ArgumentCaptor.forClass(AiProviderSettings.class);
        when(gateway.chat(settings.capture(), any())).thenReturn(reply("qwen3:14b", "ok"));

        ModelDeadline.within(Duration.ofMinutes(5), () -> client.rawChatWithModel(List.of(), List.of(), "qwen3:14b"));
        client.rawChatWithModel(List.of(), List.of(), "qwen3:14b");

        assertThat(settings.getAllValues().get(0).timeout()).isGreaterThan(Duration.ofMinutes(4)).isLessThanOrEqualTo(Duration.ofMinutes(5));
        assertThat(settings.getAllValues().get(1)).isSameAs(SETTINGS);
    }

    @Test
    @DisplayName("un budget épuisé n'appelle plus le modèle : le cas est trop lent")
    void aSpentBudgetIsTooSlow() {
        assertThatThrownBy(() -> ModelDeadline.within(Duration.ZERO, () -> client.rawChatWithModel(List.of(), List.of(), "qwen3:14b")))
            .isInstanceOf(LlmTimedOutException.class);
        verifyNoInteractions(gateway);
    }

    @Test
    @DisplayName("un modèle trop lent n'est pas un fournisseur tombé : son état reste valable")
    void aTimeoutIsNotAnOutage() {
        when(gateway.chat(any(), any())).thenThrow(new ModelProviderException.TimedOut("late", null));

        assertThatThrownBy(() -> client.rawChatWithModel(List.of(), List.of(), "qwen3:14b")).isInstanceOf(LlmTimedOutException.class);
        verify(status, never()).invalidate();
    }

    @Test
    @DisplayName("la fenêtre : celle du modèle du palier, ou du modèle que la personne a choisi")
    void theWindowOfTheTier() {
        when(gateway.window(same(SETTINGS), org.mockito.ArgumentMatchers.eq("fast-one"), org.mockito.ArgumentMatchers.eq(false)))
            .thenReturn(new ModelWindow("fast-one", 8_192, false, 2_048));
        when(gateway.window(same(SETTINGS), org.mockito.ArgumentMatchers.eq("main"), org.mockito.ArgumentMatchers.eq(true)))
            .thenReturn(new ModelWindow("main", 16_384, false, 8_192));
        when(gateway.window(same(SETTINGS), org.mockito.ArgumentMatchers.eq("qwen3:14b"), org.mockito.ArgumentMatchers.eq(false)))
            .thenReturn(new ModelWindow("qwen3:14b", 40_960, false, 2_048));

        assertThat(client.contextWindow("fast").tokens()).isEqualTo(8_192);
        assertThat(client.contextWindow("deep").tokens()).isEqualTo(16_384);
        assertThat(ChosenModel.using("qwen3:14b", () -> client.contextWindow("fast")).tokens()).isEqualTo(40_960);
    }

    @Test
    @DisplayName("un modèle plus grand à proposer : le plus petit qui tient, jamais d'après une estimation ni sans outils")
    void aLargerModelToOffer() {
        when(status.snapshot()).thenReturn(new AiStatusService.Snapshot(SETTINGS, READY, true,
            List.of("fast-one", "too-small", "guess", "no-tools", "large", "larger", "bge-m3"), List.of()));
        java.util.function.BiConsumer<String, ModelWindow> window = (name, value) -> when(
            gateway.window(same(SETTINGS), org.mockito.ArgumentMatchers.eq(name), org.mockito.ArgumentMatchers.eq(false))).thenReturn(value);
        window.accept("too-small", new ModelWindow("too-small", 8_192, false, 2_048));
        window.accept("guess", new ModelWindow("guess", 64_000, true, 2_048));
        window.accept("no-tools", new ModelWindow("no-tools", 32_768, false, 2_048));
        window.accept("large", new ModelWindow("large", 40_960, false, 2_048));
        window.accept("larger", new ModelWindow("larger", 128_000, false, 2_048));
        when(gateway.describe(same(SETTINGS), org.mockito.ArgumentMatchers.anyString())).thenReturn(java.util.Optional.empty());
        when(gateway.describe(same(SETTINGS), org.mockito.ArgumentMatchers.eq("no-tools")))
            .thenReturn(java.util.Optional.of(new ModelGateway.ModelCard(null, 32_768, false)));

        assertThat(client.largerWindow("fast", 20_000)).map(ModelWindow::model).contains("large");
        assertThat(client.largerWindow("fast", 200_000)).isEmpty();
    }

    @Test
    @DisplayName("le dernier appel garde si sa fenêtre est une estimation")
    void theContextSaysItsEstimate() {
        ObjectNode message = new ObjectMapper().createObjectNode().put("role", "assistant").put("content", "ok");
        when(gateway.chat(any(), any())).thenReturn(new ModelGateway.ChatReply("gpt", message, new LlmUsage(3, 2, 5), 16_384, true));
        client.beginUsageCapture();

        client.chatCompletion("s", "u", false, "fast");

        assertThat(client.currentContext()).isEqualTo(new LlmContext(3, 16_384, true));
        client.endUsageCapture();
    }

    static Stream<Arguments> tiers() {
        return Stream.of(
            Arguments.of("fast", null, "fast-one", false),
            Arguments.of("standard", null, "main", false),
            Arguments.of("deep", null, "main", true),
            // Sans palier : le modèle nommé (rejeu de la banque, R61), sinon le principal.
            Arguments.of(null, "qwen2.5:7b-instruct", "qwen2.5:7b-instruct", false),
            Arguments.of(null, " ", "main", false));
    }

    @ParameterizedTest(name = "palier {0}, modèle {1} : {2}, raisonnement {3}")
    @MethodSource("tiers")
    @DisplayName("le palier choisit le modèle et le raisonnement")
    void tierChoosesTheModel(String tier, String named, String model, boolean think) {
        when(gateway.chat(any(), any())).thenReturn(reply(model, "ok"));
        ArgumentCaptor<ModelGateway.ChatCall> call = ArgumentCaptor.forClass(ModelGateway.ChatCall.class);

        if (tier == null) {
            client.rawChatWithModel(List.of(Map.of("role", "user", "content", "q")), List.of(), named);
        } else {
            client.rawChat(List.of(Map.of("role", "user", "content", "q")), List.of(), tier);
        }

        verify(gateway).chat(same(SETTINGS), call.capture());
        assertThat(call.getValue().model()).isEqualTo(model);
        assertThat(call.getValue().think()).isEqualTo(think);
    }

    static Stream<Arguments> chosen() {
        return Stream.of(
            Arguments.of("fast", null, "qwen3:14b", false),
            Arguments.of("standard", null, "qwen3:14b", false),
            Arguments.of("deep", null, "qwen3:14b", true),
            // Le rejeu d'un cas nomme son modèle : il passe avant le choix de la personne.
            Arguments.of(null, "qwen2.5:7b-instruct", "qwen2.5:7b-instruct", false));
    }

    @ParameterizedTest(name = "palier {0}, modèle nommé {1} : {2}")
    @MethodSource("chosen")
    @DisplayName("le modèle choisi par la personne remplace celui du palier, le temps de l'action seulement")
    void chosenModelReplacesTheTier(String tier, String named, String model, boolean think) {
        when(gateway.chat(any(), any())).thenReturn(reply(model, "ok"));
        ArgumentCaptor<ModelGateway.ChatCall> call = ArgumentCaptor.forClass(ModelGateway.ChatCall.class);

        ChosenModel.using("qwen3:14b", () -> tier == null
            ? client.rawChatWithModel(List.of(Map.of("role", "user", "content", "q")), List.of(), named)
            : client.rawChat(List.of(Map.of("role", "user", "content", "q")), List.of(), tier));

        verify(gateway).chat(same(SETTINGS), call.capture());
        assertThat(call.getValue().model()).isEqualTo(model);
        assertThat(call.getValue().think()).isEqualTo(think);
        assertThat(ChosenModel.current()).isEmpty();
    }

    @Test
    @DisplayName("chatCompletion : système et utilisateur, mode JSON ; le contenu, l'usage et le modèle sont gardés")
    void chatCompletion() {
        when(gateway.chat(any(), any())).thenReturn(reply("fast-one", "{}"));
        ArgumentCaptor<ModelGateway.ChatCall> call = ArgumentCaptor.forClass(ModelGateway.ChatCall.class);

        client.beginUsageCapture();
        String out = client.chatCompletion("sys", "user", true, "fast");
        LlmUsage usage = client.currentUsage();
        String model = client.currentModel();
        LlmContext context = client.currentContext();
        client.endUsageCapture();

        verify(gateway).chat(any(), call.capture());
        assertThat(call.getValue().jsonMode()).isTrue();
        assertThat(call.getValue().messages()).hasSize(2);
        assertThat(out).isEqualTo("{}");
        assertThat(usage.totalTokens()).isEqualTo(5);
        assertThat(model).isEqualTo("fast-one");
        assertThat(context).isEqualTo(new LlmContext(3, null)); // le prompt du dernier appel ; pas de fenêtre ici
        assertThat(client.currentUsage()).isEqualTo(LlmUsage.ZERO);
        assertThat(client.currentContext()).isNull();
    }

    /**
     * Test du CEO du 05/11/2026 : la jauge de contexte montrait le cumul de la conversation. Ce que le modèle a lu, c'est le
     * prompt du dernier appel du tour, avec la fenêtre que la passerelle lui a donnée ; la consommation, elle, s'additionne.
     */
    @Test
    @DisplayName("la jauge : le prompt du dernier appel et sa fenêtre, pas une somme")
    void theContextIsTheLastCall() {
        ObjectNode message = new ObjectMapper().createObjectNode().put("role", "assistant").put("content", "ok");
        when(gateway.chat(any(), any())).thenReturn(
            new ModelGateway.ChatReply("qwen3:8b", message, new LlmUsage(2800, 40, 2840), 8192),
            new ModelGateway.ChatReply("qwen3:8b", message, new LlmUsage(3400, 60, 3460), 16_384));
        List<Map<String, Object>> asked = List.of(Map.of("role", "user", "content", "x"));

        client.beginUsageCapture();
        client.rawChat(asked, List.of(), "fast");
        client.rawChat(asked, List.of(), "fast");
        LlmUsage usage = client.currentUsage();
        LlmContext context = client.currentContext();
        client.endUsageCapture();

        assertThat(usage.promptTokens()).isEqualTo(6200);
        assertThat(context).isEqualTo(new LlmContext(3400, 16_384));
        // Hors capture, rien n'est gardé.
        client.rawChat(asked, List.of(), "fast");
        assertThat(client.currentContext()).isNull();
    }

    @Test
    @DisplayName("IA indisponible : échec immédiat, aucun appel au fournisseur")
    void failsFastWithoutAi() {
        ready(AiStatus.UNREACHABLE);

        assertThat(client.isConfigured()).isFalse();
        assertThatThrownBy(() -> client.chatCompletion("s", "u", false, "fast"))
            .isInstanceOf(AiGatewayClient.LlmException.class);
        verifyNoInteractions(gateway);
    }

    @Test
    @DisplayName("outils refusés jusqu'au dernier : exception dédiée, l'état de l'IA reste valable")
    void toolsRefused() {
        when(gateway.chat(any(), any())).thenThrow(new ModelProviderException.ToolsRefused("AI provider refused the tools (HTTP 400)"));

        assertThatThrownBy(() -> client.rawChat(List.of(Map.of("role", "user", "content", "q")),
                List.of(Map.of("type", "function")), "fast"))
            .isInstanceOf(LlmToolsRefusedException.class);
        verify(status, never()).invalidate();
    }

    @Test
    @DisplayName("panne du fournisseur : exception, et l'état de l'IA sera relu")
    void providerFailure() {
        when(gateway.chat(any(), any())).thenThrow(new ModelProviderException("AI provider refused the request (HTTP 500)"));

        assertThatThrownBy(() -> client.chatCompletion("s", "u", false, "fast"))
            .isInstanceOf(AiGatewayClient.LlmException.class)
            .hasMessageContaining("HTTP 500");
        verify(status).invalidate();
    }
}
