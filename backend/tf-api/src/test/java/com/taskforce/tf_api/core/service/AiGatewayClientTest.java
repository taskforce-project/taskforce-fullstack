package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Contrat d'{@link AiGatewayClient} avec l'ai-service : tier, secret, usage, échec immédiat sans IA. */
@DisplayName("AiGatewayClient (contrat avec l'ai-service)")
class AiGatewayClientTest {

    private AiStatusService status;
    private AiGatewayClient client;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        status = mock(AiStatusService.class);
        when(status.current()).thenReturn(new AiStatus(true, true, "m", "f", true, "e"));
        client = new AiGatewayClient(new ObjectMapper(), status, "http://ai-service:8000", "secret", 1_000);
        server = MockRestServiceServer.createServer((RestTemplate) ReflectionTestUtils.getField(client, "restTemplate"));
    }

    @Test
    @DisplayName("chatCompletion : POST /v1/chat avec tier, json_mode et secret ; lit le contenu et l'usage")
    void chat_completion() {
        server.expect(requestTo("http://ai-service:8000/v1/chat"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer secret"))
            .andExpect(jsonPath("$.tier").value("fast"))
            .andExpect(jsonPath("$.json_mode").value(true))
            .andExpect(jsonPath("$.messages[0].role").value("system"))
            .andExpect(jsonPath("$.model").doesNotExist())
            .andRespond(withSuccess("{\"model\":\"f\",\"message\":{\"content\":\"{}\"},"
                + "\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}", MediaType.APPLICATION_JSON));

        client.beginUsageCapture();
        String out = client.chatCompletion("sys", "user", true, "fast");
        LlmUsage usage = client.currentUsage();
        client.endUsageCapture();

        assertThat(out).isEqualTo("{}");
        assertThat(usage.totalTokens()).isEqualTo(5);
        server.verify();
    }

    @Test
    @DisplayName("rawChat : outils transmis, message assistant renvoyé tel quel")
    void raw_chat_with_tools() {
        server.expect(requestTo("http://ai-service:8000/v1/chat"))
            .andExpect(jsonPath("$.tools[0].function.name").value("search_brain"))
            .andRespond(withSuccess("{\"message\":{\"tool_calls\":[{\"id\":\"c1\"}]}}", MediaType.APPLICATION_JSON));

        var msg = client.rawChat(List.of(Map.of("role", "user", "content", "q")),
            List.of(Map.of("type", "function", "function", Map.of("name", "search_brain"))), "fast");

        assertThat(msg.path("tool_calls").isArray()).isTrue();
        server.verify();
    }

    @Test
    @DisplayName("IA indisponible → échec immédiat, aucun appel HTTP")
    void fails_fast_without_ai() {
        when(status.current()).thenReturn(AiStatus.UNREACHABLE);

        assertThat(client.isConfigured()).isFalse();
        assertThatThrownBy(() -> client.chatCompletion("s", "u", false, "fast"))
            .isInstanceOf(AiGatewayClient.LlmException.class);
        server.verify(); // aucune requête attendue
    }

    @Test
    @DisplayName("erreur de l'ai-service → exception, et l'état de l'IA sera relu")
    void server_error() {
        server.expect(requestTo("http://ai-service:8000/v1/chat")).andRespond(withServerError());

        assertThatThrownBy(() -> client.chatCompletion("s", "u", false, "fast"))
            .isInstanceOf(AiGatewayClient.LlmException.class);
        verify(status).invalidate();
        server.verify();
    }
}
