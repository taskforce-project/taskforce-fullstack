package com.taskforce.tf_api.core.service;

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
import com.taskforce.tf_api.core.service.ai.ModelGateway;
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

    @Test
    @DisplayName("chatCompletion : système et utilisateur, mode JSON ; le contenu, l'usage et le modèle sont gardés")
    void chatCompletion() {
        when(gateway.chat(any(), any())).thenReturn(reply("fast-one", "{}"));
        ArgumentCaptor<ModelGateway.ChatCall> call = ArgumentCaptor.forClass(ModelGateway.ChatCall.class);

        client.beginUsageCapture();
        String out = client.chatCompletion("sys", "user", true, "fast");
        LlmUsage usage = client.currentUsage();
        String model = client.currentModel();
        client.endUsageCapture();

        verify(gateway).chat(any(), call.capture());
        assertThat(call.getValue().jsonMode()).isTrue();
        assertThat(call.getValue().messages()).hasSize(2);
        assertThat(out).isEqualTo("{}");
        assertThat(usage.totalTokens()).isEqualTo(5);
        assertThat(model).isEqualTo("fast-one");
        assertThat(client.currentUsage()).isEqualTo(LlmUsage.ZERO);
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
