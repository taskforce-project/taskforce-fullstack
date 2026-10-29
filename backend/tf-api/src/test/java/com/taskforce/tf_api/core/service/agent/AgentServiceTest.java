package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;
import com.taskforce.tf_api.core.service.mcp.McpClient;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires de {@link AgentService} (Cortex) : repli sans IA, boucle d'outils où le modèle choisit
 * d'appeler un outil ou de répondre, messages conversationnels, mémoire, écritures MCP proposées.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AgentService")
class AgentServiceTest {

    @Mock private BrainAccessGuard access;
    @Mock private BrainSearchService search;
    @Mock private AgentToolRegistry tools;
    @Mock private LlmClient llm;   // on mocke l'INTERFACE, jamais une implémentation concrète
    @Spy  private ObjectMapper objectMapper = new ObjectMapper();
    @Mock private AiUsageService aiUsageService;
    @Mock private WorkspaceMcpService workspaceMcp;
    @Mock private AuthorizationService authorization;

    @InjectMocks private AgentService service;

    private final ObjectMapper json = new ObjectMapper();

    private void stubWorkspace() {
        Workspace ws = Workspace.builder().id(1L).slug("acme").name("Acme").build();
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(ws);
    }

    private void stubToolLoop() {
        when(workspaceMcp.toolsFor(any())).thenReturn(List.of());
        when(tools.toolDefinitions(anyList())).thenReturn(List.of());
    }

    @Test
    @DisplayName("sans IA disponible → réponse de repli, avec la recherche réelle")
    void fallback_without_ai() {
        stubWorkspace();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(false);

        AssistantAnswer answer = service.run("acme", 7L, "What is the status of the project?");

        assertThat(answer.mode()).isEqualTo("fallback");
        assertThat(answer.answer()).contains("AI unavailable");
        verify(search).retrieveRelevant(eq(1L), anyString(), anyInt());
    }

    @Test
    @DisplayName("le modèle répond sans outil → mode fast, usage réel remonté")
    void model_answers_directly() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"Direct answer\"}"));
        when(llm.currentUsage()).thenReturn(new LlmUsage(12, 34, 46));

        AssistantAnswer answer = service.run("acme", 7L, "Give me the status of the project");

        assertThat(answer.mode()).isEqualTo("fast");
        assertThat(answer.answer()).isEqualTo("Direct answer");
        assertThat(answer.usage().totalTokens()).isEqualTo(46);
        assertThat(answer.usage().promptTokens()).isEqualTo(12);
        assertThat(answer.toolCalls()).isEmpty();
    }

    @Test
    @DisplayName("aucun routage par mots-clés : tout message reçoit les outils, le modèle choisit")
    void every_message_gets_the_tools() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"ok\"}"));

        service.run("acme", 7L, "Quel est le statut du projet ?");

        verify(tools).toolDefinitions(anyList());
        verify(llm).rawChat(anyList(), anyList(), eq("fast"));
        verify(llm, never()).chat(anyList(), anyString());
    }

    @Test
    @DisplayName("boucle d'outils : un appel d'outil puis la réponse finale → mode deep")
    void tool_loop() throws Exception {
        stubWorkspace();
        stubToolLoop();
        KnowledgeNode node = KnowledgeNode.builder()
            .type(NodeType.DECISION).domain(NodeDomain.PROJET).title("Note").content("content").build();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of(node));
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"search_brain\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Final answer\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tools.get(eq("search_brain"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("tool result");

        AssistantAnswer answer = service.run("acme", 7L, "Analyze the project and propose a plan");

        assertThat(answer.mode()).isEqualTo("deep");
        assertThat(answer.answer()).isEqualTo("Final answer");
        assertThat(answer.toolCalls()).hasSize(1);
        assertThat(answer.sources()).hasSize(1);
    }

    @Test
    @DisplayName("outil inconnu → appel en erreur, réponse produite quand même")
    void unknown_tool() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"ghost\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Done\"}"));

        AssistantAnswer answer = service.run("acme", 7L, "Archive the note");

        assertThat(answer.mode()).isEqualTo("deep");
        assertThat(answer.toolCalls()).anyMatch(tc -> "error".equals(tc.status()));
    }

    @Test
    @DisplayName("le modèle échoue en cours de réponse → repli gracieux")
    void model_failure_falls_back() {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenThrow(new RuntimeException("model down"));

        AssistantAnswer answer = service.run("acme", 7L, "What is the status of the project?");

        assertThat(answer.mode()).isEqualTo("fallback");
        assertThat(answer.steps()).anyMatch(s -> "error".equals(s.status()));
    }

    @Test
    @DisplayName("le fournisseur refuse les outils : Cortex dit qu'il n'a rien fait, au lieu de répondre sans eux")
    void tools_refused_says_nothing_was_done() {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString()))
            .thenThrow(new LlmToolsRefusedException("The AI provider refused the tools", null));

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Cortex test\" in TaskForce");

        assertThat(answer.mode()).isEqualTo("fallback");
        assertThat(answer.answer()).contains("Cortex could not act").contains("nothing was created or changed");
        assertThat(answer.steps()).anyMatch(s -> "error".equals(s.status()) && s.description().contains("refused"));
    }

    @Test
    @DisplayName("une création annoncée sans outil est remplacée par la vérité (recette du 29/10)")
    void claimed_write_without_tool_is_replaced() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree(
            "{\"content\":\"**Issue created**: Project TaskForce (TF), Title Cortex test. Use list_issues to verify.\"}"));

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Cortex test\" in TaskForce");

        assertThat(answer.answer()).startsWith("I didn't create anything").doesNotContain("list_issues");
        assertThat(answer.steps()).anyMatch(s -> "error".equals(s.status()) && s.description().contains("nothing was created"));
    }

    @Test
    @DisplayName("une création faite par l'outil garde la réponse du modèle")
    void real_write_keeps_the_answer() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"create_issue\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Issue created: TF-31 Cortex test.\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tools.get(eq("create_issue"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("Created TF-31");

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Cortex test\" in TaskForce");

        assertThat(answer.answer()).isEqualTo("Issue created: TF-31 Cortex test.");
        assertThat(answer.steps()).noneMatch(s -> "error".equals(s.status()));
    }

    @ParameterizedTest(name = "« {0} » puis « {1} » : remplacée {2}")
    @CsvSource(delimiter = '|', value = {
        "Create an issue \"Cortex test\" in TaskForce | **Issue created**: Title Cortex test   | true",
        "Crée une issue « Test » dans TaskForce        | Issue créée : Test, dans TaskForce.   | true",
        "Add a note about the release                  | I added a note about the release.     | true",
        "Create a plan for the project                 | I have created a plan: first, the board. | false",
        "Which issues were created this week?          | Issue TF-12 was created on Monday.    | false",
        "How do I create an issue?                     | Open the board and click New issue.   | false",
        "Show me the open issues                       | 3 issues opened this week: TF-1, TF-2. | false",
        "What did I add to the notes?                  | You added a note about the release.   | false",
    })
    @DisplayName("la garde ne touche qu'une création annoncée sans outil, sur une demande de création")
    void honest_answer_detection(String message, String answer, boolean replaced) {
        assertThat(AgentService.honestAnswer(message, answer, List.of()).equals(answer)).isEqualTo(!replaced);
    }

    @Test
    @DisplayName("le fournisseur s'arrête après une création : la réponse la garde, au lieu de dire que rien n'a été fait")
    void stop_after_a_write_keeps_what_was_done() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString()))
            .thenReturn(json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"create_issue\",\"arguments\":\"{}\"}}]}"))
            .thenThrow(new LlmToolsRefusedException("The AI provider refused the tools", null));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tools.get(eq("create_issue"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("Created TF-31");

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Cortex test\" in TaskForce");

        assertThat(answer.answer()).contains("Cortex stopped before the end").doesNotContain("nothing was created");
        assertThat(answer.toolCalls()).anyMatch(c -> "create_issue".equals(c.name()) && "success".equals(c.status()));
        assertThat(answer.mode()).isEqualTo("deep");
    }

    @Test
    @DisplayName("une écriture externe en attente d'accord : rien n'a encore changé, la réponse le dit")
    void pending_write_is_not_announced_as_done() {
        List<AssistantToolCall> calls = List.of(new AssistantToolCall("linear__save_issue", "pending", "{}", "proposed"));

        String answer = AgentService.honestAnswer("Create an issue in Linear", "Issue created in Linear.", calls);

        assertThat(answer).isEqualTo("Nothing has changed yet: the action below waits for your approval.");
    }

    @ParameterizedTest(name = "« {0} » conversationnel : {1}")
    @CsvSource({
        "hello, true",
        "Hi!, true",
        "thanks, true",
        "Bonjour, true",
        "hey how are you, true",
        "merci beaucoup, true",
        "What is the status of the project?, false",
        "list my issues, false",
        "hello can you create an issue for the login bug, false",
    })
    @DisplayName("détection des messages conversationnels (plusieurs langues)")
    void conversational_detection(String message, boolean expected) {
        assertThat(AgentService.isConversational(message)).isEqualTo(expected);
    }

    @Test
    @DisplayName("salutation → réponse directe, SANS recherche ni sources")
    void greeting_skips_search() {
        stubWorkspace();
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chat(anyList(), anyString())).thenReturn("Hello! All good, thanks.");

        AssistantAnswer answer = service.run("acme", 7L, "Hey how are you?");

        assertThat(answer.mode()).isEqualTo("fast");
        assertThat(answer.answer()).isEqualTo("Hello! All good, thanks.");
        assertThat(answer.sources()).isEmpty();
        assertThat(answer.steps()).noneMatch(s -> s.label().contains("Brain OS"));
        verify(search, never()).retrieveRelevant(anyLong(), anyString(), anyInt());
    }

    @Test
    @DisplayName("salutation d'un compte au plafond → refus AVANT tout appel au modèle")
    void greeting_blocked_by_quota() {
        stubWorkspace();
        when(llm.isConfigured()).thenReturn(true);
        Mockito.doThrow(new IllegalStateException("Monthly AI quota reached"))
            .when(aiUsageService).assertWithinQuota(anyLong());

        assertThatThrownBy(() -> service.run("acme", 7L, "Hey how are you?"))
            .isInstanceOf(IllegalStateException.class);
        verify(llm, never()).chat(anyList(), anyString());
    }

    @Test
    @DisplayName("mémoire : l'historique est injecté entre le message système et le message courant")
    void history_is_injected() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"Your project is Zephyr.\"}"));

        List<Map<String, Object>> history = List.of(
            Map.of("role", "user", "content", "My project is called Zephyr"),
            Map.of("role", "assistant", "content", "Noted, Zephyr."));

        AssistantAnswer answer = service.run("acme", 7L, "Remind me of its name", history);

        assertThat(answer.answer()).isEqualTo("Your project is Zephyr.");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> captor = ArgumentCaptor.forClass(List.class);
        verify(llm).rawChat(captor.capture(), anyList(), anyString());
        List<Map<String, Object>> sent = captor.getValue();
        assertThat(sent).hasSize(4);
        assertThat(sent.get(0)).containsEntry("role", "system");
        assertThat(sent.get(1)).containsEntry("content", "My project is called Zephyr");
        assertThat(sent.get(2)).containsEntry("role", "assistant");
        assertThat(sent.get(3)).containsEntry("content", "Remind me of its name");
    }

    @Test
    @DisplayName("écriture dans un outil externe (MCP) → PROPOSÉE à un gestionnaire, pas exécutée")
    void external_write_is_proposed() throws Exception {
        stubWorkspace();
        stubExternalWrite();
        when(authorization.isManager(1L, 7L)).thenReturn(true);

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue in the external tool");

        assertThat(answer.toolCalls()).hasSize(1);
        assertThat(answer.toolCalls().get(0).status()).isEqualTo("pending");
        verify(extClient, never()).initialize(any()); // rien n'a été envoyé au serveur MCP
    }

    @Test
    @DisplayName("écriture dans un outil externe demandée par un simple membre → refusée, sans bouton de validation")
    void external_write_refused_to_a_member() throws Exception {
        stubWorkspace();
        stubExternalWrite();
        when(authorization.isManager(1L, 7L)).thenReturn(false);

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue in the external tool");

        // « pending » afficherait « Approve and run » ; un membre ne peut pas valider (OSS-1.5).
        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("error");
            assertThat(call.output()).contains("owners and admins");
        });
        verify(extClient, never()).initialize(any());
    }

    private final McpClient extClient = Mockito.mock(McpClient.class);

    /** Un outil MCP d'écriture connecté, que le modèle appelle puis résume. */
    private void stubExternalWrite() throws Exception {
        ReflectionTestUtils.setField(service, "mcpToolTier", "fast");
        ReflectionTestUtils.setField(service, "maxExternalTools", 20);
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);

        var writeDef = new McpClient.ToolDef("do_write", "writes something", json.readTree("{\"type\":\"object\"}"), false);
        var extTool = new ExternalMcpTool(extClient, new McpClient.ServerRef("srv", "http://x/mcp", null), writeDef, json);
        when(workspaceMcp.toolsFor(any())).thenReturn(List.of(extTool));
        when(tools.toolDefinitions(anyList())).thenReturn(List.of());
        when(tools.get(eq("srv__do_write"), anyList())).thenReturn(extTool);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"srv__do_write\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"I propose to create the issue.\"}"));
    }

    @Test
    @DisplayName("outils externes connectés → le message système les annonce et donne les règles d'usage")
    void prompt_carries_tool_rules() throws Exception {
        stubWorkspace();
        ReflectionTestUtils.setField(service, "mcpToolTier", "fast");
        ReflectionTestUtils.setField(service, "maxExternalTools", 20);
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        var readDef = new McpClient.ToolDef("list_things", "lists things", json.readTree("{\"type\":\"object\"}"), true);
        var extTool = new ExternalMcpTool(Mockito.mock(McpClient.class),
            new McpClient.ServerRef("linear", "http://x/mcp", null), readDef, json);
        when(workspaceMcp.toolsFor(any())).thenReturn(List.of(extTool));
        when(tools.toolDefinitions(anyList())).thenReturn(List.of());
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"ok\"}"));

        service.run("acme", 7L, "Show me the Linear things");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> captor = ArgumentCaptor.forClass(List.class);
        verify(llm).rawChat(captor.capture(), anyList(), anyString());
        String system = String.valueOf(captor.getValue().get(0).get("content"));
        assertThat(system).contains("linear__list_things")
            .contains("CALL IT")
            .contains("external system")
            .contains("target TaskForce by default")
            .contains("find_integration");
    }
}
