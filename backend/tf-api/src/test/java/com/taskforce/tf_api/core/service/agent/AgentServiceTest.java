package com.taskforce.tf_api.core.service.agent;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.GroqService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AgentService}. Chemin de repli (sans clé LLM) : retrieval réel + réponse fallback.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AgentService")
class AgentServiceTest {

    @Mock private com.taskforce.tf_api.core.service.brain.BrainAccessGuard access;
    @Mock private com.taskforce.tf_api.core.service.brain.BrainSearchService search;
    @Mock private AgentToolRegistry tools;
    @Mock private GroqService groq;
    @Mock private ObjectMapper objectMapper;

    @InjectMocks private AgentService service;

    @Test
    @DisplayName("run renvoie une réponse de repli (strategy fallback) quand Groq n'est pas configuré")
    void run_fallback_without_llm() {
        Workspace ws = Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(ws);
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(groq.isConfigured()).thenReturn(false);

        AssistantAnswer answer = service.run("acme", 7L, "Quel est le statut du projet ?");

        assertThat(answer).isNotNull();
        assertThat(answer.mode()).isEqualTo("fallback");
    }

    private Workspace stubWorkspace() {
        Workspace ws = Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(ws);
        return ws;
    }

    @Test
    @DisplayName("run (fast) : message non-deep + Groq configuré → réponse directe, mode fast")
    void run_fast_direct() {
        stubWorkspace();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "model", "m");
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(groq.isConfigured()).thenReturn(true);
        when(groq.chatCompletion(anyString(), anyString(), anyString(), org.mockito.ArgumentMatchers.anyBoolean()))
            .thenReturn("Réponse directe");

        AssistantAnswer answer = service.run("acme", 7L, "Bonjour, ça va ?");

        assertThat(answer.mode()).isEqualTo("fast");
        assertThat(answer.answer()).isEqualTo("Réponse directe");
    }

    @Test
    @DisplayName("run (deep) : boucle d'outils — 1 appel d'outil puis réponse finale, mode deep")
    void run_deep_tool_loop() throws Exception {
        stubWorkspace();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "model", "m");

        var node = com.taskforce.tf_api.core.model.KnowledgeNode.builder()
            .type(com.taskforce.tf_api.core.enums.NodeType.DECISION)
            .domain(com.taskforce.tf_api.core.enums.NodeDomain.PROJET)
            .title("Note").content("contenu").build();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of(node));
        when(groq.isConfigured()).thenReturn(true);
        when(tools.toolDefinitions()).thenReturn(List.of());

        var real = new ObjectMapper();
        var withCall = real.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"search_brain\",\"arguments\":\"{}\"}}]}");
        var finalMsg = real.readTree("{\"content\":\"Réponse finale\"}");
        when(groq.rawChat(anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
            .thenReturn(withCall, finalMsg);

        AgentTool tool = org.mockito.Mockito.mock(AgentTool.class);
        when(tools.get("search_brain")).thenReturn(tool);
        when(tool.execute(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn("résultat outil");

        AssistantAnswer answer = service.run("acme", 7L, "analyse le projet et propose un plan");

        assertThat(answer.mode()).isEqualTo("deep");
        assertThat(answer.answer()).isEqualTo("Réponse finale");
        assertThat(answer.toolCalls()).hasSize(1);
        assertThat(answer.sources()).hasSize(1);
    }

    @Test
    @DisplayName("run (deep) : outil inconnu → tool call en erreur mais réponse produite")
    void run_deep_unknown_tool() throws Exception {
        stubWorkspace();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "model", "m");
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(groq.isConfigured()).thenReturn(true);
        when(tools.toolDefinitions()).thenReturn(List.of());

        var real = new ObjectMapper();
        var withCall = real.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"ghost\",\"arguments\":\"{}\"}}]}");
        var finalMsg = real.readTree("{\"content\":\"Fini\"}");
        when(groq.rawChat(anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
            .thenReturn(withCall, finalMsg);
        when(tools.get("ghost")).thenReturn(null);

        AssistantAnswer answer = service.run("acme", 7L, "décide et archive la note");

        assertThat(answer.mode()).isEqualTo("deep");
        assertThat(answer.toolCalls()).anyMatch(tc -> "error".equals(tc.status()));
    }

    @Test
    @DisplayName("run : exception LLM en cours de génération → repli gracieux (mode fallback)")
    void run_exception_falls_back() {
        stubWorkspace();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "model", "m");
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(groq.isConfigured()).thenReturn(true);
        when(groq.chatCompletion(anyString(), anyString(), anyString(), org.mockito.ArgumentMatchers.anyBoolean()))
            .thenThrow(new RuntimeException("LLM down"));

        AssistantAnswer answer = service.run("acme", 7L, "Bonjour");

        assertThat(answer.mode()).isEqualTo("fallback");
    }
}
