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
    @Mock private com.taskforce.tf_api.core.service.AiUsageService aiUsageService;
    @Mock private com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService workspaceMcp;

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
        // Chemin fast = complétion multi-tours (llm.chat) désormais.
        when(groq.chat(anyString(), org.mockito.ArgumentMatchers.any(), anyString()))
            .thenReturn("Réponse directe");
        when(groq.currentUsage()).thenReturn(new com.taskforce.tf_api.core.service.LlmUsage(12, 34, 46));

        // Message « métier » (non small-talk) → chemin knowledge fast (avec recherche Brain OS).
        AssistantAnswer answer = service.run("acme", 7L, "Donne-moi le statut du projet");

        assertThat(answer.mode()).isEqualTo("fast");
        assertThat(answer.answer()).isEqualTo("Réponse directe");
        // usage réel remonté jusqu'au DTO
        assertThat(answer.usage().totalTokens()).isEqualTo(46);
        assertThat(answer.usage().promptTokens()).isEqualTo(12);
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
        when(workspaceMcp.toolsFor(org.mockito.ArgumentMatchers.any())).thenReturn(List.of());
        when(tools.toolDefinitions(org.mockito.ArgumentMatchers.anyList())).thenReturn(List.of());

        var real = new ObjectMapper();
        var withCall = real.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"search_brain\",\"arguments\":\"{}\"}}]}");
        var finalMsg = real.readTree("{\"content\":\"Réponse finale\"}");
        when(groq.rawChat(anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyString()))
            .thenReturn(withCall, finalMsg);

        AgentTool tool = org.mockito.Mockito.mock(AgentTool.class);
        when(tools.get(org.mockito.ArgumentMatchers.eq("search_brain"), org.mockito.ArgumentMatchers.anyList())).thenReturn(tool);
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
        when(workspaceMcp.toolsFor(org.mockito.ArgumentMatchers.any())).thenReturn(List.of());
        when(tools.toolDefinitions(org.mockito.ArgumentMatchers.anyList())).thenReturn(List.of());

        var real = new ObjectMapper();
        var withCall = real.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"ghost\",\"arguments\":\"{}\"}}]}");
        var finalMsg = real.readTree("{\"content\":\"Fini\"}");
        when(groq.rawChat(anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyString()))
            .thenReturn(withCall, finalMsg);
        // tools.get("ghost", external) renvoie null par défaut (mock) → chemin « outil inconnu ».

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
        when(groq.chat(anyString(), org.mockito.ArgumentMatchers.any(), anyString()))
            .thenThrow(new RuntimeException("LLM down"));

        AssistantAnswer answer = service.run("acme", 7L, "Quel est le statut du projet ?");

        assertThat(answer.mode()).isEqualTo("fallback");
    }

    @Test
    @DisplayName("run (conversationnel) : salutation → réponse directe, SANS recherche Brain OS ni sources")
    void run_conversational_greeting() {
        stubWorkspace();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "model", "m");
        when(groq.isConfigured()).thenReturn(true);
        when(groq.chat(anyString(), org.mockito.ArgumentMatchers.any(), anyString()))
            .thenReturn("Bonjour ! Tout va bien, merci 😊");

        AssistantAnswer answer = service.run("acme", 7L, "Hey comment va tu ?");

        assertThat(answer.mode()).isEqualTo("fast");
        assertThat(answer.answer()).isEqualTo("Bonjour ! Tout va bien, merci 😊");
        assertThat(answer.sources()).isEmpty();
        // Étapes réelles : pas de « Recherche dans le Brain OS » pour un simple bonjour
        assertThat(answer.steps()).noneMatch(s -> s.label().contains("Brain OS"));
        // Et aucune recherche n'a été déclenchée
        org.mockito.Mockito.verify(search, org.mockito.Mockito.never())
            .retrieveRelevant(anyLong(), anyString(), anyInt());
    }

    @Test
    @DisplayName("run (mémoire) : l'historique de la conversation est injecté dans les messages du LLM")
    void run_injects_conversation_history() {
        stubWorkspace();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "model", "m");
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(groq.isConfigured()).thenReturn(true);
        when(groq.chat(anyString(), org.mockito.ArgumentMatchers.any(), anyString()))
            .thenReturn("Ton projet s'appelle Zephyr.");

        List<java.util.Map<String, Object>> history = List.of(
            java.util.Map.of("role", "user", "content", "Mon projet s'appelle Zephyr"),
            java.util.Map.of("role", "assistant", "content", "Bien noté, Zephyr."));

        AssistantAnswer answer = service.run("acme", 7L, "Rappelle-moi son nom", history);

        assertThat(answer.answer()).isEqualTo("Ton projet s'appelle Zephyr.");

        // Les messages envoyés au LLM = system + historique (2) + message courant.
        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<List<java.util.Map<String, Object>>> captor =
            org.mockito.ArgumentCaptor.forClass(List.class);
        org.mockito.Mockito.verify(groq).chat(anyString(), captor.capture(), anyString());
        List<java.util.Map<String, Object>> sent = captor.getValue();
        assertThat(sent).hasSize(4);
        assertThat(sent.get(0)).containsEntry("role", "system");
        assertThat(sent.get(1)).containsEntry("content", "Mon projet s'appelle Zephyr");
        assertThat(sent.get(2)).containsEntry("role", "assistant");
        assertThat(sent.get(3)).containsEntry("content", "Rappelle-moi son nom");
    }

    @Test
    @DisplayName("run (deep) : écriture externe MCP → PROPOSÉE (pending), pas exécutée (validation humaine)")
    void run_deep_external_write_is_proposed_not_executed() throws Exception {
        stubWorkspace();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "model", "m");
        org.springframework.test.util.ReflectionTestUtils.setField(service, "confirmExternalWrites", true);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "mcpToolTier", "fast");
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(groq.isConfigured()).thenReturn(true);

        // Un outil externe d'ÉCRITURE (readOnly=false) découvert pour le workspace.
        var extClient = org.mockito.Mockito.mock(com.taskforce.tf_api.core.service.mcp.McpClient.class);
        var real = new ObjectMapper();
        var writeDef = new com.taskforce.tf_api.core.service.mcp.McpClient.ToolDef(
            "do_write", "écrit qqch", real.readTree("{\"type\":\"object\"}"), false);
        var extTool = new com.taskforce.tf_api.core.service.mcp.ExternalMcpTool(
            extClient,
            new com.taskforce.tf_api.core.service.mcp.McpClient.ServerRef("srv", "http://x/mcp", null),
            writeDef, real);
        when(workspaceMcp.toolsFor(org.mockito.ArgumentMatchers.any())).thenReturn(List.of(extTool));
        when(tools.toolDefinitions(org.mockito.ArgumentMatchers.anyList())).thenReturn(List.of());
        when(tools.get(org.mockito.ArgumentMatchers.eq("srv__do_write"), org.mockito.ArgumentMatchers.anyList()))
            .thenReturn(extTool);

        var real2 = new ObjectMapper();
        var withCall = real2.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"srv__do_write\",\"arguments\":\"{}\"}}]}");
        var finalMsg = real2.readTree("{\"content\":\"Je propose de créer l'issue.\"}");
        when(groq.rawChat(anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyString()))
            .thenReturn(withCall, finalMsg);

        AssistantAnswer answer = service.run("acme", 7L, "crée une issue dans l'outil externe");

        assertThat(answer.mode()).isEqualTo("deep");
        assertThat(answer.toolCalls()).hasSize(1);
        assertThat(answer.toolCalls().get(0).status()).isEqualTo("pending");
        // L'écriture externe n'a PAS été exécutée (aucun appel au serveur MCP).
        org.mockito.Mockito.verify(extClient, org.mockito.Mockito.never())
            .initialize(org.mockito.ArgumentMatchers.any());
    }
}
