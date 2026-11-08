package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.response.AssistantActionResult;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.LlmContext;
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.ai.ContextBudget;
import com.taskforce.tf_api.core.service.ai.ModelWindow;
import com.taskforce.tf_api.core.service.ai.TurnHistory;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.brain.BrainViewer;
import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;
import com.taskforce.tf_api.core.service.mcp.McpClient;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
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
    @Mock private CortexRecordService records;
    @Mock private CortexUndo undo;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private WorkspaceRepository workspaces;
    @Mock private ScreenContext screens;
    @Mock private IssueMaterial material;

    @InjectMocks private AgentService service;

    private static final UUID RECORD = UUID.fromString("00000000-0000-0000-0000-0000000000aa");

    /** Le vrai noyau derrière Cortex : les règles par défaut de l'espace, jugées par RulesEngine ; le dossier simulé. */
    @BeforeEach
    void realKernel() {
        Workspace owned = Workspace.builder().id(1L).slug("acme").name("Acme")
            .owner(User.builder().email("owner@acme.test").build()).build();
        lenient().when(workspaces.findById(1L)).thenReturn(Optional.of(owned));
        ReflectionTestUtils.setField(service, "gate", new CortexGate(new HarnessRulesService(ruleSets), workspaces));
        lenient().when(records.open(any(), any(), any())).thenReturn(RECORD);
        lenient().when(records.append(any(), any(), any(), any())).thenReturn(Optional.of("hash"));
        lenient().when(records.incident(any(), any(), any(), any(), any())).thenReturn(RECORD);
    }

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
    @DisplayName("sans IA disponible → réponse de repli, avec la recherche réelle dans ce que la personne lit")
    void fallback_without_ai() {
        stubWorkspace();
        BrainViewer viewer = BrainViewer.seeing(1L, List.of(3L));
        when(access.viewer(1L, 7L)).thenReturn(viewer);
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(false);

        AssistantAnswer answer = service.run("acme", 7L, "What is the status of the project?");

        assertThat(answer.mode()).isEqualTo("fallback");
        assertThat(answer.answer()).contains("AI unavailable");
        verify(search).retrieveRelevant(eq(viewer), anyString(), anyInt());
    }

    @Test
    @DisplayName("le modèle répond sans outil → mode fast, usage réel remonté")
    void model_answers_directly() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
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

    /**
     * Tests du CEO du 05/11/2026 : la jauge de contexte comparait le cumul de la conversation à une fenêtre écrite en dur,
     * et rien ne disait quel modèle avait répondu. La réponse dit le modèle que la passerelle a appelé, la taille du prompt
     * de son dernier appel et la fenêtre que la passerelle lui a donnée (null quand le fournisseur la tient).
     */
    @ParameterizedTest(name = "fenêtre {1} : modèle {0}")
    @CsvSource(nullValues = "-", value = {"qwen3:8b, 8192", "openai/gpt-oss-20b, -"})
    void the_answer_says_its_model_and_what_it_read(String model, Integer window) throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"Direct answer\"}"));
        when(llm.currentUsage()).thenReturn(new LlmUsage(6200, 140, 6340));
        when(llm.currentModel()).thenReturn(model);
        when(llm.currentContext()).thenReturn(new LlmContext(3100, window));

        AssistantAnswer answer = service.run("acme", 7L, "Give me the status of the project");

        assertThat(answer.model()).isEqualTo(model);
        assertThat(answer.usage().promptTokens()).isEqualTo(6200); // le tour entier, pour la consommation
        assertThat(answer.usage().lastPromptTokens()).isEqualTo(3100); // le dernier appel, pour la jauge
        assertThat(answer.usage().contextWindow()).isEqualTo(window);
    }

    @Test
    @DisplayName("aucun routage par mots-clés : tout message reçoit les outils, le modèle choisit")
    void every_message_gets_the_tools() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
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
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of(node));
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"search_brain\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Final answer\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tool.name()).thenReturn("search_brain");
        when(tools.get(eq("search_brain"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("tool result");

        AssistantAnswer answer = service.run("acme", 7L, "Analyze the project and propose a plan");

        assertThat(answer.mode()).isEqualTo("deep");
        assertThat(answer.answer()).isEqualTo("Final answer");
        assertThat(answer.toolCalls()).hasSize(1);
        assertThat(answer.sources()).hasSize(1);
        // La ligne grise (R123) : l'outil qui lit et a abouti, et la note servie au modèle.
        assertThat(answer.read().tools()).containsExactly(new AssistantRead.ToolRead("search_brain", 1));
        assertThat(answer.read().notes()).isEqualTo(1);
    }

    @Test
    @DisplayName("outil inconnu → appel en erreur, réponse produite quand même")
    void unknown_tool() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
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
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
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
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString()))
            .thenThrow(new LlmToolsRefusedException("The AI provider refused the tools", null));

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Cortex test\" in TaskForce");

        assertThat(answer.mode()).isEqualTo("fallback");
        assertThat(answer.answer()).startsWith("> [!warning] Cortex could not act").contains("nothing was created or changed");
        assertThat(answer.steps()).anyMatch(s -> "error".equals(s.status()) && s.description().contains("refused"));
    }

    @Test
    @DisplayName("une création annoncée sans outil : la phrase remplacée par la vérité, signée par TaskForce (recette du 29/10)")
    void claimed_write_without_tool_is_replaced() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree(
            "{\"content\":\"**Issue created**: Project TaskForce (TF), Title Cortex test. Use list_issues to verify.\"}"));

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Cortex test\" in TaskForce");

        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce\n> Nothing was created in this turn.\n\n"
            + "Use list_issues to verify.");
        assertThat(answer.steps()).anyMatch(s -> "error".equals(s.status()) && s.description().contains("TaskForce corrected it"));
    }

    @Test
    @DisplayName("l'échange 6 du 02/11/2026 : la suppression annoncée après list_issues est remplacée, l'incident au dossier (E17)")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void a_deletion_announced_after_a_read_is_corrected_and_recorded() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"list_issues\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"La carte TESTTA-2 a été supprimée du projet test-taskforce.\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        lenient().when(tool.name()).thenReturn("list_issues");
        when(tools.get(eq("list_issues"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("Issues in test-taskforce (3): TESTTA-1, TESTTA-2, TESTTA-3");

        AssistantAnswer answer = service.run("acme", 7L, "What changed in this project this week?");

        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce\n> Nothing was deleted in this turn.");
        assertThat(answer.record()).isEqualTo(RECORD.toString());
        ArgumentCaptor<Map<String, Object>> incident = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(records).incident(any(), eq(RECORD), eq("What changed in this project this week?"), any(), incident.capture());
        assertThat(incident.getValue()).containsEntry("experiment", "E17").containsEntry("rule", "R116")
            .containsEntry("said", List.of("La carte TESTTA-2 a été supprimée du projet test-taskforce."))
            .containsEntry("tools", List.of("list_issues: success"));
    }

    @Test
    @DisplayName("une action annoncée sans aucun outil : le dossier s'ouvre pour l'incident, et la réponse le porte")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void a_claim_without_any_tool_opens_a_record_for_the_incident() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.currentModel()).thenReturn("qwen3:8b");
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"J'ai supprimé TESTTA-2.\"}"));

        AssistantAnswer answer = service.run("acme", 7L, "suprime testta 2");

        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce\n> Nothing was deleted in this turn.");
        assertThat(answer.record()).isEqualTo(RECORD.toString());
        ArgumentCaptor<Map<String, Object>> origin = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(records).incident(any(), Mockito.isNull(), eq("suprime testta 2"), origin.capture(), any());
        assertThat(origin.getValue()).containsEntry("model", "qwen3:8b").containsEntry("notes", List.of());
    }

    @Test
    @DisplayName("une panne du dossier ne rend pas la phrase fausse : la correction reste, l'incident se journalise")
    void a_record_failure_keeps_the_correction() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"I deleted TESTTA-2.\"}"));
        when(records.incident(any(), any(), any(), any(), any())).thenThrow(new IllegalStateException("database down"));

        AssistantAnswer answer = service.run("acme", 7L, "delete TESTTA-2");

        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce\n> Nothing was deleted in this turn.");
        assertThat(answer.record()).isNull();
    }

    @Test
    @DisplayName("une création faite par l'outil garde la réponse du modèle")
    void real_write_keeps_the_answer() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"create_project\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Project created: CORTEX Cortex test.\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tool.name()).thenReturn("create_project");
        when(tools.get(eq("create_project"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("Project created in TaskForce: CORTEX \"Cortex test\" (id 31).");

        AssistantAnswer answer = service.run("acme", 7L, "Create a project \"Cortex test\" in TaskForce");

        assertThat(answer.answer()).isEqualTo("Project created: CORTEX Cortex test.");
        assertThat(answer.steps()).noneMatch(s -> "error".equals(s.status()));
    }

    @Test
    @DisplayName("le fournisseur s'arrête après une création : la réponse la garde, au lieu de dire que rien n'a été fait")
    void stop_after_a_write_keeps_what_was_done() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString()))
            .thenReturn(json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"create_project\",\"arguments\":\"{}\"}}]}"))
            .thenThrow(new LlmToolsRefusedException("The AI provider refused the tools", null));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tool.name()).thenReturn("create_project");
        when(tools.get(eq("create_project"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("Project created in TaskForce: CORTEX \"Cortex test\" (id 31).");

        AssistantAnswer answer = service.run("acme", 7L, "Create a project \"Cortex test\" in TaskForce");

        assertThat(answer.answer()).contains("Cortex stopped before the end").doesNotContain("nothing was created");
        assertThat(answer.toolCalls()).anyMatch(c -> "create_project".equals(c.name()) && "success".equals(c.status()));
        assertThat(answer.mode()).isEqualTo("deep");
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
        verify(search, never()).retrieveRelevant(any(), anyString(), anyInt());
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
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
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
        // La notion du temps (R48) : la date du jour, et le Backlog sauf si le travail doit commencer maintenant.
        String today = java.time.LocalDate.now(java.time.ZoneOffset.UTC)
            .format(java.time.format.DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", java.util.Locale.ENGLISH));
        assertThat((String) sent.get(0).get("content")).contains("Today is " + today + " (UTC)")
            .contains("keep it in the Backlog unless the work must start now");
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

    // -------------------------------------------------------------------------
    // Le noyau pour Cortex (R35) : chaque outil jugé par les règles de l'espace, chaque décision au dossier
    // -------------------------------------------------------------------------

    /** Un outil interne que le modèle appelle une fois, puis une réponse. */
    private AgentTool stubInternalCall(String name) throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"" + name + "\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Done.\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        lenient().when(tool.name()).thenReturn(name); // lu au dossier, que certains cas font tomber avant
        when(tools.get(eq(name), anyList())).thenReturn(tool);
        return tool;
    }

    /** Une règle de l'espace qui refuse tout. */
    private void denyEverything(String reason) {
        CortexGate deny = Mockito.mock(CortexGate.class);
        when(deny.judge(any(), any())).thenReturn(new CortexGate.Verdict("deny", "frozen", reason, Map.of()));
        ReflectionTestUtils.setField(service, "gate", deny);
    }

    @ParameterizedTest(name = "{0} : {1}, par les règles par défaut")
    @CsvSource({
        "search_brain,   success", // knowledge.search : autorisée
        "create_issue,   pending", // issue.create : autorisée, mais préparée en carte que la personne crée (R47, R78)
        "create_note,    success", // knowledge.create : autorisée (30/10/2026), une note se supprime d'un geste
        "create_project, success", // project.create : autorisée (30/10/2026), un projet s'archive d'un geste
    })
    void the_rules_decide_whether_a_tool_runs(String name, String status) throws Exception {
        AgentTool tool = stubInternalCall(name);
        lenient().when(tool.execute(any(), any())).thenReturn("done");

        AssistantAnswer answer = service.run("acme", 7L, "Write the release notes");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo(status);
            assertThat(call.record()).isEqualTo(RECORD.toString());
        });
        verify(tool, "success".equals(status) ? Mockito.times(1) : never()).execute(any(), any());
    }

    @Test
    @DisplayName("ce qui compte manque (une personne qui désigne plusieurs membres) : une question, pas de carte (R102)")
    void a_prepared_issue_that_lacks_what_matters_asks_first() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        when(tool.prepare(any(), any())).thenReturn(AgentTool.Prepared.ask("Several members of Website match \"Marie\": "
            + "Marie Curie (marie@acme.dev), Marie Dupont (mdupont@acme.dev). Ask the person which one; do not pick one yourself."));

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue for Marie: fix the footer");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            // Ni « pending » (la carte), ni une erreur : la question suit dans la réponse.
            assertThat(call.status()).isEqualTo(AgentService.QUESTION);
            assertThat(call.output()).startsWith("Several members of Website match \"Marie\"")
                .contains("Ask the person one short question with the choices")
                .contains("the other fields stay editable on the card");
            assertThat(call.record()).isEqualTo(RECORD.toString());
        });
        verify(tool, never()).execute(any(), any());
    }

    @Test
    @DisplayName("rien ne manque : la carte, sans question")
    void a_prepared_issue_with_what_matters_shows_the_card() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        when(tool.prepare(any(), any())).thenReturn(null);

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue in Website: fix the footer");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("pending");
            assertThat(call.output()).startsWith("Issue prepared as a card");
            assertThat(call.input()).isEqualTo("{}"); // rien de résolu : les arguments de Cortex
        });
    }

    @Test
    @DisplayName("la carte montre ce que le serveur a résolu : « moi » devient l'e-mail de la personne (rejeu de la 1.8.0)")
    void the_card_shows_the_arguments_the_server_resolved() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        when(tool.prepare(any(), any())).thenReturn(AgentTool.Prepared.card(Map.of("assignee", "pierre@acme.dev")));

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue in Website, assigned to me: fix the footer");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("pending");
            assertThat(call.input()).isEqualTo("{\"assignee\":\"pierre@acme.dev\"}");
        });
    }

    @Test
    @DisplayName("les consignes de Cortex : ne remplir que ce qui est dit, une seule question sur ce qui compte")
    void the_instructions_ask_only_about_what_matters() throws Exception {
        stubInternalCall("create_issue");

        service.run("acme", 7L, "Create an issue: fix the footer");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> messages = ArgumentCaptor.forClass(List.class);
        verify(llm, Mockito.atLeastOnce()).rawChat(messages.capture(), anyList(), anyString());
        String system = String.valueOf(messages.getAllValues().get(0).get(0).get("content"));
        assertThat(system)
            .contains("Fill only what the request or the project says")
            .contains("an assignee (a member of the project)")
            .contains("Ask one short question, with the choices, before preparing the card only when what matters is unclear")
            .contains("matches several members")
            .contains("Never ask about the other fields")
            .doesNotContainIgnoringCase("subtask");
    }

    @Test
    @DisplayName("tracer avant d'agir : la demande puis la décision au dossier avant l'outil, le résultat après")
    void every_tool_is_recorded_before_it_runs() throws Exception {
        AgentTool tool = stubInternalCall("create_project");
        when(tool.execute(any(), any())).thenReturn("Project created in TaskForce: NOTES \"Release notes\" (id 31).");

        service.run("acme", 7L, "Create a project \"Release notes\"");

        InOrder order = Mockito.inOrder(records, tool);
        order.verify(records).open(any(), eq("Create a project \"Release notes\""), any());
        order.verify(records).append(eq(RECORD), eq("action.requested"), eq(CortexRecordService.Actor.CORTEX), any());
        order.verify(records).append(eq(RECORD), eq("action.decided"), eq(CortexRecordService.Actor.rule("create-project")), any());
        order.verify(tool).execute(any(), any());
        order.verify(records).append(eq(RECORD), eq("action.result"), eq(CortexRecordService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("une réponse sans outil n'ouvre pas de dossier")
    void no_tool_no_record() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"Direct answer\"}"));

        service.run("acme", 7L, "Give me the status of the project");

        verify(records, never()).open(any(), any(), any());
    }

    @Test
    @DisplayName("sans dossier, pas d'action : une panne du dossier arrête l'outil")
    void no_record_no_action() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        when(records.open(any(), any(), any())).thenThrow(new IllegalStateException("database down"));

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Release notes\"");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("error");
            assertThat(call.record()).isNull();
        });
        verify(tool, never()).execute(any(), any());
    }

    @Test
    @DisplayName("un dossier plein arrête l'action : la demande n'y entre plus, l'outil ne tourne pas")
    void a_full_record_stops_the_action() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        when(records.append(any(), eq("action.requested"), any(), any())).thenReturn(Optional.empty());

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Release notes\"");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("error");
            assertThat(call.output()).contains("record of this answer is full");
        });
        verify(tool, never()).execute(any(), any());
    }

    @Test
    @DisplayName("une règle qui refuse : l'outil ne tourne pas, la raison revient au modèle")
    void a_rule_that_denies_refuses_the_tool() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        denyEverything("Issues are frozen until the release.");

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Release notes\"");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("refused");
            assertThat(call.output()).contains("Issues are frozen until the release.").contains("Do not try again");
        });
        verify(tool, never()).execute(any(), any());
    }

    @Test
    @DisplayName("une création refusée par les règles ne se dit pas faite : TaskForce dit pourquoi")
    void refused_write_is_not_announced_as_done() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"create_issue\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Issue created: Release notes.\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        lenient().when(tool.name()).thenReturn("create_issue");
        when(tools.get(eq("create_issue"), anyList())).thenReturn(tool);
        denyEverything("Issues are frozen until the release.");

        AssistantAnswer answer = service.run("acme", 7L, "Create an issue \"Release notes\"");

        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce\n"
            + "> Nothing was created: the rules of this workspace refuse this action.");
        assertThat(answer.record()).isEqualTo(RECORD.toString());
    }

    /** Une action interne que Cortex a proposée au dossier, et que la personne accorde. */
    private AgentTool approvedInternal(String name) {
        stubWorkspace();
        AgentTool tool = Mockito.mock(AgentTool.class);
        lenient().when(tool.name()).thenReturn(name);
        when(tools.get(name)).thenReturn(tool);
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        when(records.approve(any(), any(), any(), any())).thenReturn(true);
        return tool;
    }

    @Test
    @DisplayName("une action accordée : l'accord gardé, les règles rejugées, l'outil lancé avec les droits de la personne")
    void approved_action_runs_and_is_recorded() {
        AgentTool tool = approvedInternal("create_note");
        when(tool.execute(any(), any())).thenReturn("Note created");

        AssistantActionResult result = service.runApproved("acme", 7L, "create_note", "{\"title\":\"T\"}", RECORD.toString());

        assertThat(result.status()).isEqualTo("success");
        assertThat(result.output()).isEqualTo("Note created");
        InOrder order = Mockito.inOrder(records, tool);
        order.verify(records).approve(RECORD, "create_note", 7L, "{\"title\":\"T\"}");
        order.verify(records).append(eq(RECORD), eq("action.decided"), eq(CortexRecordService.Actor.rule("create-note")), any());
        order.verify(tool).execute(eq(Map.of("title", "T")), any());
        order.verify(records).append(eq(RECORD), eq("action.result"), eq(CortexRecordService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("R123 : une action accordée garde le modèle qui l'a proposée, celui du dossier, le temps de l'action")
    void an_approved_action_keeps_the_model_of_its_record() {
        AgentTool tool = approvedInternal("create_note");
        when(records.model(RECORD)).thenReturn(Optional.of("qwen3:8b"));
        java.util.concurrent.atomic.AtomicReference<String> during = new java.util.concurrent.atomic.AtomicReference<>();
        when(tool.execute(any(), any())).thenAnswer(call -> {
            during.set(com.taskforce.tf_api.core.security.DelegatedAgent.model().orElse(null));
            return "Note created";
        });

        service.runApproved("acme", 7L, "create_note", "{\"title\":\"T\"}", RECORD.toString());

        assertThat(during.get()).isEqualTo("qwen3:8b");
        assertThat(com.taskforce.tf_api.core.security.DelegatedAgent.model()).isEmpty();
    }

    @Test
    @DisplayName("un accord sans proposition qui l'attend (jamais proposée, ou déjà accordée) : rien ne tourne")
    void approval_without_a_waiting_proposal_is_refused() {
        stubWorkspace();
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tools.get("create_note")).thenReturn(tool);
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        when(records.approve(any(), any(), any(), any())).thenReturn(false);

        assertThatThrownBy(() -> service.runApproved("acme", 7L, "create_note", "{}", RECORD.toString()))
            .isInstanceOf(BusinessException.class).hasMessageContaining("no longer waiting");
        verify(tool, never()).execute(any(), any());
    }

    @ParameterizedTest(name = "dossier « {0} » : refusé")
    @CsvSource({"not-a-uuid", "''"})
    void approval_with_an_unreadable_record_is_refused(String ref) {
        stubWorkspace();

        assertThatThrownBy(() -> service.runApproved("acme", 7L, "create_note", "{}", ref))
            .isInstanceOf(BusinessException.class).hasMessageContaining("record is not valid");
        verify(records, never()).approve(any(), any(), any(), any());
    }

    @Test
    @DisplayName("le dossier d'une autre personne ne se prolonge pas")
    void approval_on_someone_elses_record_is_refused() {
        stubWorkspace();
        when(records.owns(eq(RECORD), any())).thenReturn(false);

        assertThatThrownBy(() -> service.runApproved("acme", 7L, "create_note", "{}", RECORD.toString()))
            .isInstanceOf(ResourceNotFoundException.class);
        verify(records, never()).approve(any(), any(), any(), any());
        verify(records, never()).append(any(), any(), any(), any());
    }

    @Test
    @DisplayName("une écriture externe accordée par un simple membre : refusée, rien n'est envoyé (OSS-1.5)")
    void external_approval_by_a_member_is_refused() throws Exception {
        stubWorkspace();
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        var writeDef = new McpClient.ToolDef("do_write", "writes something", json.readTree("{\"type\":\"object\"}"), false);
        var extTool = new ExternalMcpTool(extClient, new McpClient.ServerRef("srv", "http://x/mcp", null), writeDef, json);
        when(tools.get("srv__do_write")).thenReturn(null); // pas un outil interne : cherché parmi les connecteurs
        when(workspaceMcp.toolsFor(any())).thenReturn(List.of(extTool));
        when(tools.get(eq("srv__do_write"), anyList())).thenReturn(extTool);
        when(authorization.isManager(1L, 7L)).thenReturn(false);

        assertThatThrownBy(() -> service.runApproved("acme", 7L, "srv__do_write", "{}", RECORD.toString()))
            .isInstanceOf(BusinessException.class).hasMessageContaining("owners and admins");
        verify(records, never()).approve(any(), any(), any(), any());
        verify(extClient, never()).initialize(any());
    }

    @Test
    @DisplayName("les règles refusent depuis la proposition : rien ne tourne, le refus est gardé")
    void approval_refused_when_the_rules_changed() {
        AgentTool tool = approvedInternal("create_note");
        denyEverything("Notes are frozen.");

        AssistantActionResult result = service.runApproved("acme", 7L, "create_note", "{}", RECORD.toString());

        assertThat(result.status()).isEqualTo("refused");
        assertThat(result.output()).contains("Notes are frozen.");
        verify(tool, never()).execute(any(), any());
        verify(records).append(eq(RECORD), eq("action.result"), eq(CortexRecordService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("des arguments illisibles : l'action ne tourne pas, l'erreur est gardée")
    void approval_with_unreadable_arguments() {
        AgentTool tool = approvedInternal("create_note");

        AssistantActionResult result = service.runApproved("acme", 7L, "create_note", "{not json", RECORD.toString());

        assertThat(result.status()).isEqualTo("error");
        assertThat(result.output()).contains("not readable");
        verify(tool, never()).execute(any(), any());
        verify(records).append(eq(RECORD), eq("action.result"), eq(CortexRecordService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("un outil qui échoue après l'accord : l'échec est gardé au dossier, puis remonte tel quel")
    void a_failed_approved_action_is_recorded_then_raised() {
        AgentTool tool = approvedInternal("create_project");
        when(tool.execute(any(), any())).thenThrow(new BusinessException("A project with this key exists."));

        assertThatThrownBy(() -> service.runApproved("acme", 7L, "create_project", "{}", RECORD.toString()))
            .isInstanceOf(BusinessException.class).hasMessage("A project with this key exists.");
        verify(records).append(eq(RECORD), eq("action.result"), eq(CortexRecordService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("une panne du dossier après l'action ne la dit pas ratée : elle a eu lieu")
    void a_record_failure_after_the_action_keeps_its_result() {
        AgentTool tool = approvedInternal("create_note");
        when(tool.execute(any(), any())).thenReturn("Note created");
        when(records.append(any(), eq("action.result"), any(), any())).thenThrow(new IllegalStateException("database down"));

        AssistantActionResult result = service.runApproved("acme", 7L, "create_note", "{}", RECORD.toString());

        assertThat(result.status()).isEqualTo("success");
        assertThat(result.output()).isEqualTo("Note created");
    }

    /** Un outil MCP d'écriture connecté, que le modèle appelle puis résume. */
    private void stubExternalWrite() throws Exception {
        ReflectionTestUtils.setField(service, "mcpToolTier", "fast");
        ReflectionTestUtils.setField(service, "maxExternalTools", 20);
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
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
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
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

    // -------------------------------------------------------------------------
    // Le modèle au dossier et le rejeu d'un cas de la banque
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("le dossier garde ce qui a répondu : le modèle, le tier, les notes servies")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void the_record_keeps_what_answered() throws Exception {
        AgentTool tool = stubInternalCall("create_project");
        when(tool.execute(any(), any())).thenReturn("Project created in TaskForce: NOTES \"Release notes\" (id 31).");
        when(llm.currentModel()).thenReturn("qwen3:8b");

        service.run("acme", 7L, "Create a project \"Release notes\"");

        ArgumentCaptor<Map<String, Object>> origin = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(records).open(any(), eq("Create a project \"Release notes\""), origin.capture());
        assertThat(origin.getValue()).containsEntry("model", "qwen3:8b").containsEntry("tier", "fast")
            .containsEntry("notes", List.of());
    }

    private static final ReplayCase CASE = new ReplayCase("Which issues are blocked, and why?", LocalDate.of(2026, 10, 29),
        List.of(new ReplayCase.FrozenNote("Release plan", "PROJET", "Ship on Friday.")),
        List.of(new ReplayCase.CassetteEntry("list_issues", ReplayCase.canonical("{\"status\":\"Blocked\"}"),
            "TF-4 Deploy [Blocked], blocked by TF-3")));

    private AgentTool stubReplayTool(String name) {
        when(tools.toolDefinitions(anyList())).thenReturn(List.of());
        AgentTool tool = Mockito.mock(AgentTool.class);
        lenient().when(tool.name()).thenReturn(name);
        when(tools.get(eq(name), anyList())).thenReturn(tool);
        return tool;
    }

    @Test
    @DisplayName("au rejeu, le modèle nommé lit la cassette, avec la date et les notes du cas ; l'espace n'est pas touché")
    @SuppressWarnings("unchecked")
    void a_replay_serves_reads_from_the_cassette() throws Exception {
        AgentTool tool = stubReplayTool("list_issues");
        when(llm.rawChatWithModel(anyList(), anyList(), eq("llama3.2"))).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"list_issues\","
                + "\"arguments\":\"{\\\"status\\\": \\\"Blocked\\\"}\"}}]}"),
            json.readTree("{\"content\":\"TF-4 is blocked by TF-3.\"}"));
        when(llm.currentModel()).thenReturn("llama3.2");

        ReplayOutcome outcome = service.replay(new AgentContext("acme", 1L, 7L), CASE, "llama3.2");

        assertThat(outcome.answer()).isEqualTo("TF-4 is blocked by TF-3.");
        assertThat(outcome.model()).isEqualTo("llama3.2");
        assertThat(outcome.calls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("success");
            assertThat(call.effect()).isEqualTo("allow");
        });
        ArgumentCaptor<List<Map<String, Object>>> messages = ArgumentCaptor.forClass(List.class);
        verify(llm, Mockito.times(2)).rawChatWithModel(messages.capture(), anyList(), eq("llama3.2"));
        assertThat((String) messages.getValue().get(0).get("content"))
            .contains("Today is Thursday 29 October 2026 (UTC)").contains("Release plan");
        assertThat(messages.getValue()).anyMatch(m -> "TF-4 Deploy [Blocked], blocked by TF-3".equals(m.get("content")));
        verify(tool, never()).execute(any(), any());
        verify(records, never()).open(any(), any(), any());
        verify(search, never()).retrieveRelevant(any(), anyString(), anyInt());
    }

    @ParameterizedTest(name = "{0} au rejeu : {1}, jamais lancé")
    @CsvSource({
        "create_issue,  pending", // une écriture se joue à blanc : proposée, jamais exécutée
        "list_projects, error",   // une lecture que le cas n'a pas faite : notée, jamais lancée sur l'espace
    })
    void a_replay_never_acts_on_the_workspace(String name, String status) throws Exception {
        AgentTool tool = stubReplayTool(name);
        when(llm.rawChat(anyList(), anyList(), eq("fast"))).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"" + name + "\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Done.\"}"));

        ReplayOutcome outcome = service.replay(new AgentContext("acme", 1L, 7L), CASE, null);

        assertThat(outcome.calls()).singleElement().satisfies(call -> assertThat(call.status()).isEqualTo(status));
        verify(tool, never()).execute(any(), any());
        verify(records, never()).open(any(), any(), any());
    }

    @Test
    @DisplayName("au banc (R131), une écriture que la cassette simule est dite réussie, pour que la demande continue ; rien n'est lancé")
    void a_benchmark_simulates_a_write() throws Exception {
        AgentTool tool = stubReplayTool("update_issue");
        ReplayCase simulated = new ReplayCase("Move it.", java.time.LocalDate.of(2026, 11, 9), List.of(),
            List.of(new ReplayCase.CassetteEntry("update_issue", ReplayCase.ANY, "Done: the issue is updated.")));
        when(llm.rawChatWithModel(anyList(), anyList(), eq("qwen3:8b"))).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"update_issue\",\"arguments\":\"{\\\"issue\\\":\\\"X-1\\\"}\"}}]}"),
            json.readTree("{\"content\":\"Moved.\"}"));

        ReplayOutcome outcome = service.replay(new AgentContext("acme", 1L, 7L), simulated, "qwen3:8b");

        assertThat(outcome.calls()).singleElement().satisfies(call -> assertThat(call.status()).isEqualTo("success"));
        verify(tool, never()).execute(any(), any());
        verify(records, never()).open(any(), any(), any());
    }

    @Test
    @DisplayName("une réponse sans outil (R131) : la matière dans le prompt, aucune définition d'outil, l'usage rendu ; l'espace n'est pas touché")
    @SuppressWarnings("unchecked")
    void an_answer_without_tools() throws Exception {
        when(llm.rawChatWithModel(anyList(), anyList(), eq("qwen3:8b"))).thenReturn(json.readTree("{\"content\":\"Un résumé.\"}"));
        when(llm.currentModel()).thenReturn("qwen3:8b");
        when(llm.currentUsage()).thenReturn(new LlmUsage(50, 5, 55));

        ReplayOutcome outcome = service.answerFrom("OPS-35: rien.", "Résume OPS-35.", java.time.LocalDate.of(2026, 11, 9), "qwen3:8b");

        assertThat(outcome.answer()).isEqualTo("Un résumé.");
        assertThat(outcome.calls()).isEmpty();
        assertThat(outcome.model()).isEqualTo("qwen3:8b");
        assertThat(outcome.usage().totalTokens()).isEqualTo(55);
        ArgumentCaptor<List<Map<String, Object>>> messages = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<List<Map<String, Object>>> definitions = ArgumentCaptor.forClass(List.class);
        verify(llm).rawChatWithModel(messages.capture(), definitions.capture(), eq("qwen3:8b"));
        assertThat(definitions.getValue()).isEmpty();
        assertThat((String) messages.getValue().get(0).get("content")).contains("OPS-35: rien.").contains("Monday 9 November 2026");
        assertThat(messages.getValue().get(1).get("content")).isEqualTo("Résume OPS-35.");
        verify(llm).endUsageCapture();
        verify(records, never()).open(any(), any(), any());
    }

    @Test
    @DisplayName("au rejeu, la banque note la réponse que la personne verrait, corrigée par TaskForce (R116)")
    void a_replay_is_checked_like_an_answer() throws Exception {
        stubReplayTool("list_issues");
        when(llm.rawChat(anyList(), anyList(), eq("fast"))).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"list_issues\","
                + "\"arguments\":\"{\\\"status\\\":\\\"Blocked\\\"}\"}}]}"),
            json.readTree("{\"content\":\"TF-4 has been deleted.\"}"));

        ReplayOutcome outcome = service.replay(new AgentContext("acme", 1L, 7L), CASE, null);

        assertThat(outcome.answer()).isEqualTo("> [!taskforce] TaskForce\n> Nothing was deleted in this turn.");
        verify(records, never()).incident(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("au rejeu, une règle qui refuse est gardée telle quelle dans la note")
    void a_replay_keeps_a_refusal() throws Exception {
        stubReplayTool("create_issue");
        denyEverything("Issues are frozen.");
        when(llm.rawChat(anyList(), anyList(), eq("fast"))).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"create_issue\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"It is refused.\"}"));

        ReplayOutcome outcome = service.replay(new AgentContext("acme", 1L, 7L), CASE, " ");

        assertThat(outcome.calls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("refused");
            assertThat(call.effect()).isEqualTo("deny");
        });
    }

    // -------------------------------------------------------------------------
    // « Undo » (R77, séance n°13)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("undo défait par le dossier de la personne le résultat que la carte nomme, et dit ce qui est défait")
    @SuppressWarnings("unchecked")
    void undo_goes_through_the_record() throws Exception {
        stubWorkspace();
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        when(undo.handles("create_project")).thenReturn(true);
        com.fasterxml.jackson.databind.JsonNode kept = json.readTree("{\"output\": \"Project created in TaskForce: X\"}");
        when(records.undo(eq(RECORD), eq("create_project"), eq(7L), eq("sha256:r1"), any())).thenAnswer(inv ->
            Optional.of(((java.util.function.Function<com.fasterxml.jackson.databind.JsonNode, String>) inv.getArgument(4))
                .apply(kept)));
        when(undo.undo(eq("create_project"), eq(kept), any(AgentContext.class))).thenReturn("Removed the project X.");

        AssistantActionResult result = service.undo("acme", 7L, "create_project", RECORD.toString(), "sha256:r1");

        assertThat(result.status()).isEqualTo("success");
        assertThat(result.output()).isEqualTo("Removed the project X.");
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({
        "le dossier d'une autre personne, false, true,  true",
        "un outil qui ne se défait pas,   true,  false, true",
        "rien à défaire,                  true,  true,  false",
    })
    void undo_refuses(String label, boolean owns, boolean handles, boolean somethingToUndo) {
        stubWorkspace();
        lenient().when(records.owns(eq(RECORD), any())).thenReturn(owns);
        lenient().when(undo.handles("create_issue")).thenReturn(handles);
        lenient().when(records.undo(eq(RECORD), eq("create_issue"), eq(7L), any(), any()))
            .thenReturn(somethingToUndo ? Optional.of("done") : Optional.empty());

        assertThatThrownBy(() -> service.undo("acme", 7L, "create_issue", RECORD.toString(), null))
            .isInstanceOf(owns ? BusinessException.class : ResourceNotFoundException.class);
    }

    // -------------------------------------------------------------------------
    // Les gestes du MCP TaskForce (ADR-024, TF-J1-5)
    // -------------------------------------------------------------------------

    private CortexGesture gesture(String name, String action) {
        CortexGesture tool = Mockito.mock(CortexGesture.class);
        lenient().when(tool.name()).thenReturn(name);
        lenient().when(tool.action()).thenReturn(action);
        lenient().when(tools.get(eq(name), anyList())).thenReturn(tool);
        return tool;
    }

    private void modelCalls(String name, String arguments, String answer) throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"" + name + "\",\"arguments\":"
                + json.writeValueAsString(arguments) + "}}]}"),
            json.readTree("{\"content\":\"" + answer + "\"}"));
    }

    @Test
    @DisplayName("un geste qui se défait se fait d'emblée : la réponse rend l'issue, et le dossier de quoi le défaire")
    @SuppressWarnings("unchecked")
    void an_undoable_gesture_is_done_at_once() throws Exception {
        modelCalls("update_issue", "{\"issue\":\"TF-12\",\"status\":\"In Progress\"}", "TF-12 is in progress.");
        CortexGesture tool = gesture("update_issue", "issue.update");
        Map<String, Object> target = Map.of("issueId", 5, "projectId", 12, "key", "TF-12", "title", "Fix login");
        Map<String, Object> kept = Map.of("projectId", 12, "issueId", 5, "fields", Map.of());
        when(tool.perform(any(), any())).thenReturn(new CortexGesture.Done("Updated TF-12 \"Fix login\": column from Todo "
            + "to In Progress.", target, kept));

        AssistantAnswer answer = service.run("acme", 7L, "Move TF-12 to In Progress");

        AssistantToolCall call = answer.toolCalls().get(0);
        assertThat(call.status()).isEqualTo("success");
        assertThat(call.ref()).isEqualTo("hash");
        assertThat(call.target()).isEqualTo(target);
        // Le résultat garde de quoi défaire le geste ; la règle update-issue l'a permis.
        ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
        verify(records, Mockito.atLeastOnce()).append(eq(RECORD), eq("action.result"), any(), data.capture());
        assertThat(data.getValue()).containsEntry("undo", kept).containsEntry("status", "success");
    }

    @Test
    @DisplayName("R123 : ce que Cortex écrit garde le modèle qui a répondu, le temps du geste seulement")
    void a_gesture_keeps_the_model_that_answered() throws Exception {
        modelCalls("update_issue", "{\"issue\":\"TF-12\",\"status\":\"In Progress\"}", "TF-12 is in progress.");
        CortexGesture tool = gesture("update_issue", "issue.update");
        when(llm.currentModel()).thenReturn("qwen3:8b");
        java.util.concurrent.atomic.AtomicReference<String> during = new java.util.concurrent.atomic.AtomicReference<>();
        when(tool.perform(any(), any())).thenAnswer(call -> {
            during.set(com.taskforce.tf_api.core.security.DelegatedAgent.model().orElse(null));
            return new CortexGesture.Done("Updated TF-12.", Map.of("issueId", 5), null);
        });

        AssistantAnswer answer = service.run("acme", 7L, "Move TF-12 to In Progress");

        assertThat(during.get()).isEqualTo("qwen3:8b");
        assertThat(com.taskforce.tf_api.core.security.DelegatedAgent.model()).isEmpty();
        assertThat(answer.model()).isEqualTo("qwen3:8b");
        // Un geste n'est pas une lecture : la ligne grise ne le compte pas.
        assertThat(answer.read().tools()).isEmpty();
    }

    @Test
    @DisplayName("un geste qui n'a rien changé n'a pas d'Undo : la carte n'en montre pas un qui échouerait")
    void a_gesture_that_changed_nothing_has_no_undo() throws Exception {
        modelCalls("update_issue", "{\"issue\":\"TF-12\",\"assignee\":\"moi\"}", "TF-12 is already yours.");
        CortexGesture tool = gesture("update_issue", "issue.update");
        when(tool.perform(any(), any())).thenReturn(new CortexGesture.Done("TF-12 \"Fix login\" already has these values: "
            + "nothing changed.", Map.of("issueId", 5), null));

        AssistantAnswer answer = service.run("acme", 7L, "Assigne TF-12 a moi");

        assertThat(answer.toolCalls().get(0).status()).isEqualTo("success");
        assertThat(answer.toolCalls().get(0).ref()).isNull();
    }

    @Test
    @DisplayName("confier l'issue à un agent ne se défait pas d'ici : Cortex le demande, même quand les règles le permettent")
    void a_gesture_that_cannot_be_undone_asks() throws Exception {
        modelCalls("delegate_issue", "{\"issue\":\"TF-12\"}", "I propose to hand TF-12 to Claude Code.");
        CortexGesture tool = gesture("delegate_issue", "mission.start");

        AssistantAnswer answer = service.run("acme", 7L, "Give TF-12 to Claude Code");

        assertThat(answer.toolCalls().get(0).status()).isEqualTo("pending");
        assertThat(answer.toolCalls().get(0).output()).contains("can't be undone from the conversation");
        assertThat(answer.toolCalls().get(0).ref()).isNull();
        // La phrase est celle du serveur : le modèle ne dit pas « I have handed the issue to Claude Code » avant l'accord.
        assertThat(answer.answer()).isEqualTo(AgentService.CARD_ANSWERS.get("delegate_issue"));
        verify(tool, never()).perform(any(), any());
    }

    @ParameterizedTest(name = "{0} [{1}] : la phrase du modèle gardée {2}")
    @CsvSource({
        "delete_issue,   pending, false",
        "delegate_issue, pending, false",
        "delete_issue,   success, true",
        "update_issue,   success, true",
        "create_issue,   pending, true",
    })
    @DisplayName("un geste qui attend la personne parle par sa carte")
    void a_gesture_waiting_on_its_card_speaks_through_it(String tool, String status, boolean kept) {
        List<AssistantToolCall> calls = List.of(new AssistantToolCall(tool, status, "{}", "out", "r"));

        String answer = AgentService.cardAnswer("Otherwise, I'll proceed with deletion.", calls);

        assertThat(answer.equals("Otherwise, I'll proceed with deletion.")).isEqualTo(kept);
    }

    @Test
    @DisplayName("« supprime TF-12 » : la règle delete-issue demande, et la carte dit ce qui partirait, sans rien supprimer")
    void a_deletion_asks_and_shows_what_goes_with_the_issue() throws Exception {
        modelCalls("delete_issue", "{\"issue\":\"TF-12\"}", "Check the card to delete TF-12.");
        CortexGesture tool = gesture("delete_issue", "issue.delete");
        Map<String, Object> target = Map.of("issueId", 5, "key", "TF-12", "title", "Fix login", "comments", 3);
        when(tool.preview(any(), any())).thenReturn(new CortexGesture.Done("Deleting TF-12 \"Fix login\" removes it for "
            + "good, with its 3 comments.", target, null));

        AssistantAnswer answer = service.run("acme", 7L, "Supprime TF-12");

        AssistantToolCall call = answer.toolCalls().get(0);
        assertThat(call.status()).isEqualTo("pending");
        assertThat(call.target()).isEqualTo(target);
        assertThat(call.output()).startsWith("Deleting TF-12 \"Fix login\" removes it for good").contains("waiting for their approval");
        assertThat(call.ref()).isNull();
        assertThat(answer.answer()).isEqualTo(AgentService.CARD_ANSWERS.get("delete_issue"));
        verify(tool, never()).perform(any(), any());
    }

    @Test
    @DisplayName("lire une mission se fait d'emblée : la réponse rend l'issue et sa mission, sans rien décider")
    void reading_a_mission_is_done_at_once() throws Exception {
        modelCalls("get_mission", "{\"issue\":\"TF-12\"}", "Claude Code asks to fetch nodejs.org.");
        CortexGesture tool = gesture("get_mission", "issue.read");
        when(tool.perform(any(), any())).thenReturn(new CortexGesture.Done("The mission on TF-12 asks one thing.",
            Map.of("issueId", 5, "runId", 100), null));

        AssistantAnswer answer = service.run("acme", 7L, "What does Claude Code need on TF-12?");

        assertThat(answer.toolCalls().get(0).status()).isEqualTo("success");
        assertThat(answer.toolCalls().get(0).target()).containsEntry("runId", 100);
    }

    @Test
    @DisplayName("accordée sur sa carte, la mission part, et la réponse rend l'issue pour montrer sa mission")
    void an_approved_delegation_runs_and_returns_its_issue() throws Exception {
        stubWorkspace();
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        when(records.approve(RECORD, "delegate_issue", 7L, "{\"issue\":\"TF-12\"}")).thenReturn(true);
        CortexGesture tool = Mockito.mock(CortexGesture.class);
        when(tool.name()).thenReturn("delegate_issue");
        when(tool.action()).thenReturn("mission.start");
        when(tools.get("delegate_issue")).thenReturn(tool);
        when(tool.perform(any(), any())).thenReturn(new CortexGesture.Done("Delegated TF-12 to Claude Code.",
            Map.of("issueId", 5, "runId", 100), null));

        AssistantActionResult result = service.runApproved("acme", 7L, "delegate_issue", "{\"issue\":\"TF-12\"}",
            RECORD.toString());

        assertThat(result.status()).isEqualTo("success");
        assertThat(result.target()).containsEntry("runId", 100);
        assertThat(result.ref()).isNull(); // une mission lancée ne se défait pas : aucun Undo à nommer
    }

    // -------------------------------------------------------------------------
    // R114 : l'écran ; R115 : TaskForce demande ; R117 : le plan de la demande (séance n°17)
    // -------------------------------------------------------------------------

    private static final Question WHICH = Question.of("issue", "Issue", "Which issue should be deleted?", List.of(
        Question.Choice.recommended("TESTTA-2", "TESTTA-2 Ajouter la version LTS", "In review by AI"),
        Question.Choice.of("TESTTA-3", "TESTTA-3 Corriger le login", "Todo")));

    @SuppressWarnings("unchecked")
    private String systemPrompt() {
        ArgumentCaptor<List<Map<String, Object>>> messages = ArgumentCaptor.forClass(List.class);
        verify(llm, Mockito.atLeastOnce()).rawChat(messages.capture(), anyList(), anyString());
        return String.valueOf(messages.getAllValues().get(0).get(0).get("content"));
    }

    @Test
    @DisplayName("R114 et R117 : le plan de la demande, puis l'écran, puis les notes, dans le prompt")
    void the_plan_and_the_screen_come_before_the_notes() throws Exception {
        stubWorkspace();
        stubToolLoop();
        KnowledgeNode note = KnowledgeNode.builder().title("Release process").domain(NodeDomain.RUNBOOKS)
            .content("Ship on Fridays").build();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of(note));
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"OK\"}"));
        when(screens.read(any())).thenReturn(new ScreenContext.Seen(
            "On screen, what the person sees now.\nProject TESTTA \"test taskforce\".\n", "TESTTA", 3, null));

        AssistantAnswer answer = service.run("acme", 7L, "supprime l issue qu il y a dans in review by AI", List.of(),
            new Screen(12L, null));

        String system = systemPrompt();
        int plan = system.indexOf("Plan to delete or archive an issue:");
        int screen = system.indexOf("On screen, what the person sees now.");
        int notes = system.indexOf("Context (the workspace's notes)");
        assertThat(plan).isPositive();
        assertThat(screen).isGreaterThan(plan);
        assertThat(notes).isGreaterThan(screen);
        ArgumentCaptor<AgentContext> seen = ArgumentCaptor.forClass(AgentContext.class);
        verify(screens).read(seen.capture());
        assertThat(seen.getValue().screen()).isEqualTo(new Screen(12L, null));
        // La ligne grise (R123) : le tableau de l'écran et la note servie, comptés.
        assertThat(answer.read().boards()).containsExactly(new AssistantRead.BoardRead("TESTTA", 3, null));
        assertThat(answer.read().notes()).isEqualTo(1);
        assertThat(answer.read().issues()).isEmpty();
    }

    @Test
    @DisplayName("sans écran, rien ne se lit, et une demande sans plan n'en reçoit aucun")
    void without_a_screen_nothing_is_read() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"OK\"}"));

        service.run("acme", 7L, "liste moi les issues dans test taskforce");

        assertThat(systemPrompt()).doesNotContain("Plan to").doesNotContain("On screen");
        verifyNoInteractions(screens);
    }

    @Test
    @DisplayName("R115 : ce qu'il manque au geste, TaskForce le demande en carte, et la réponse s'arrête sur la question")
    @SuppressWarnings("unchecked")
    void a_missing_need_is_asked_by_taskforce() throws Exception {
        modelCalls("delete_issue", "{}", "Which issue do you want me to delete?");
        CortexGesture tool = gesture("delete_issue", "issue.delete");
        when(tool.ask(any(), any())).thenThrow(new QuestionNeeded(WHICH));

        AssistantAnswer answer = service.run("acme", 7L, "supprime ça", List.of(), new Screen(12L, 22L));

        AssistantToolCall call = answer.toolCalls().get(0);
        assertThat(call.status()).isEqualTo(AgentService.QUESTION);
        assertThat(call.ref()).isEqualTo("hash"); // la réponse nommera cette question
        assertThat(call.questions()).singleElement().satisfies(question -> {
            assertThat(question.field()).isEqualTo("issue");
            assertThat(question.header()).isEqualTo("Issue");
            assertThat(question.multiple()).isFalse();
            assertThat(question.choices()).extracting(AssistantAnswer.AssistantChoice::value).containsExactly("TESTTA-2", "TESTTA-3");
            assertThat(question.choices()).extracting(AssistantAnswer.AssistantChoice::description)
                .containsExactly("In review by AI", "Todo");
            assertThat(question.choices().get(0).recommended()).isTrue();
        });
        // La question est celle de TaskForce, signée, pas la phrase du modèle ; le modèle n'est pas rappelé.
        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce · asks\n> Which issue should be deleted?\n");
        verify(llm, Mockito.times(1)).rawChat(anyList(), anyList(), anyString());
        verify(tool, never()).preview(any(), any());
        verify(tool, never()).perform(any(), any());
        // Le dossier garde la question, les arguments du geste et l'écran, dont la suite reprendra.
        ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
        verify(records, Mockito.atLeastOnce()).append(eq(RECORD), eq("action.result"), any(), data.capture());
        assertThat(data.getValue()).containsEntry("status", "question").containsEntry("arguments", "{}");
        assertThat((List<Map<String, Object>>) data.getValue().get("questions")).singleElement()
            .satisfies(question -> assertThat(question).containsEntry("field", "issue").containsEntry("header", "Issue"));
        assertThat((Map<String, Object>) data.getValue().get("screen")).containsEntry("projectId", 12L).containsEntry("issueId", 22L);
    }

    /**
     * « Supprime ça » : qwen3:8b répondait « dites-moi laquelle » sans outil (04/11/2026). Le plan de la demande nomme le
     * geste ; TaskForce en pose lui-même la question, avec l'écran en choix, au dossier de la réponse.
     */
    @ParameterizedTest(name = "« {0} » sans outil : {1}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "supprime ça                   | delete_issue",
        "crée un projet Next.js        | create_project",
        "résume le projet              | -",
    })
    void taskforce_asks_when_cortex_does_not_act(String message, String gesture) throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString()))
            .thenReturn(json.readTree("{\"content\":\"Dites-moi laquelle, et je m'en occupe.\"}"));
        Question asked = Question.free("delete_issue".equals(gesture) ? "issue" : "name", "Issue", "Which one?");
        if (gesture != null) {
            CortexGesture tool = Mockito.mock(CortexGesture.class);
            lenient().when(tool.name()).thenReturn(gesture);
            lenient().when(tool.action()).thenReturn("delete_issue".equals(gesture) ? "issue.delete" : "project.create");
            when(tools.get(gesture)).thenReturn(tool);
            lenient().when(tool.ask(any(), any())).thenThrow(new QuestionNeeded(asked));
            lenient().when(tool.perform(any(), any())).thenThrow(new QuestionNeeded(asked));
        }

        AssistantAnswer answer = service.run("acme", 7L, message);

        if (gesture == null) {
            assertThat(answer.answer()).isEqualTo("Dites-moi laquelle, et je m'en occupe.");
            assertThat(answer.toolCalls()).isEmpty();
            return;
        }
        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce · asks\n> Which one?\n");
        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.name()).isEqualTo(gesture);
            assertThat(call.status()).isEqualTo(AgentService.QUESTION);
            assertThat(call.record()).isEqualTo(RECORD.toString());
            assertThat(call.ref()).isEqualTo("hash");
        });
    }

    @Test
    @DisplayName("R115 : un geste qui découvre en cours ce qu'il ne peut pas deviner (deux Ada) demande, sans rien écrire")
    void a_gesture_that_finds_an_ambiguity_asks() throws Exception {
        modelCalls("update_issue", "{\"issue\":\"TF-12\",\"assignee\":\"ada\"}", "Done.");
        CortexGesture tool = gesture("update_issue", "issue.update");
        when(tool.ask(any(), any())).thenAnswer(inv -> inv.getArgument(0));
        when(tool.perform(any(), any())).thenThrow(new QuestionNeeded(Question.of("assignee", "Assignee",
            "Who should take TF-12? Several members of TaskForce match \"ada\".", List.of(
                Question.Choice.of("ada@acme.test", "Ada Lovelace"), Question.Choice.of("ada.b@acme.test", "Ada Byron")))));

        AssistantAnswer answer = service.run("acme", 7L, "assigne TF-12 à Ada");

        assertThat(answer.toolCalls().get(0).status()).isEqualTo(AgentService.QUESTION);
        assertThat(answer.toolCalls().get(0).questions().get(0).choices()).hasSize(2)
            .noneMatch(AssistantAnswer.AssistantChoice::recommended);
        assertThat(answer.answer())
            .isEqualTo("> [!taskforce] TaskForce · asks\n> Who should take TF-12? Several members of TaskForce match \"ada\".\n");
    }

    /**
     * Test du CEO du 05/11/2026 : « supprime l'issue qu'il y a dans In review by AI ». Quand Cortex ne fait pas le geste
     * (aucun outil, ou une lecture seulement), TaskForce le fait sur la demande : la colonne nommée désigne l'issue, et sa
     * carte attend la personne, sans rien supprimer ; la réponse dit où décider.
     */
    @ParameterizedTest(name = "le modèle : {0}")
    @ValueSource(strings = {"none", "list_issues"})
    void taskforce_shows_the_card_of_the_issue_the_column_names(String modelDid) throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        if ("none".equals(modelDid)) {
            when(llm.rawChat(anyList(), anyList(), anyString()))
                .thenReturn(json.readTree("{\"content\":\"Laquelle voulez-vous supprimer ?\"}"));
        } else {
            gesture("list_issues", "issue.read");
            when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
                json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"list_issues\",\"arguments\":\"{}\"}}]}"),
                json.readTree("{\"content\":\"TESTTA-1 et TESTTA-2 ont le meme titre.\"}"));
        }
        CortexGesture delete = Mockito.mock(CortexGesture.class);
        lenient().when(delete.name()).thenReturn("delete_issue");
        lenient().when(delete.action()).thenReturn("issue.delete");
        when(tools.get("delete_issue")).thenReturn(delete);
        when(delete.ask(any(), any())).thenReturn(Map.of("issue", "TESTTA-2", "projectId", 12, "issueId", 22));
        when(delete.preview(any(), any())).thenReturn(new CortexGesture.Done("Deleting TESTTA-2, in In review by AI, removes "
            + "it for good.", Map.of("issueId", 22, "key", "TESTTA-2", "column", "In review by AI"), null));

        AssistantAnswer answer = service.run("acme", 7L, "supprime l'issue qu'il y a dans In review by AI", List.of(),
            new Screen(12L, null));

        AssistantToolCall card = answer.toolCalls().get(answer.toolCalls().size() - 1);
        assertThat(card.name()).isEqualTo("delete_issue");
        assertThat(card.status()).isEqualTo("pending");
        assertThat(card.record()).isEqualTo(RECORD.toString());
        assertThat(card.target()).containsEntry("key", "TESTTA-2").containsEntry("column", "In review by AI");
        assertThat(json.readTree(card.input()).path("issueId").asInt()).isEqualTo(22); // l'accord reprend cette issue
        assertThat(answer.answer()).isEqualTo(AgentService.CARD_ANSWERS.get("delete_issue"));
        ArgumentCaptor<AgentContext> ctx = ArgumentCaptor.forClass(AgentContext.class);
        verify(delete).ask(any(), ctx.capture());
        assertThat(ctx.getValue().request()).isEqualTo("supprime l'issue qu'il y a dans In review by AI");
        verify(delete, never()).perform(any(), any());
    }

    @Test
    @DisplayName("une carte qui attend déjà la personne : TaskForce n'en ajoute pas une seconde")
    void no_second_card_when_one_already_waits() throws Exception {
        modelCalls("update_issue", "{\"issue\":\"TF-12\",\"assignee\":\"ada\"}", "Done.");
        CortexGesture update = gesture("update_issue", "issue.update");
        when(update.ask(any(), any())).thenThrow(new QuestionNeeded(Question.of("assignee", "Assignee", "Who?", List.of())));

        AssistantAnswer answer = service.run("acme", 7L, "supprime TF-12 puis assigne-la a Ada");

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> assertThat(call.name()).isEqualTo("update_issue"));
        verify(tools, never()).get("delete_issue");
    }

    /**
     * Test du CEO du 05/11/2026 : « prend OPS-35 et propose moi un resume dans les commentaire stp ». Pour résumer, TaskForce
     * lit l'issue nommée et la donne au modèle avant qu'il écrive, après le plan. Une autre demande ne la lit pas.
     */
    @ParameterizedTest(name = "« {0} » : lue {1}")
    @CsvSource(delimiter = '|', value = {
        "prend OPS-35 et propose moi un resume dans les commentaire stp | true",
        "liste moi les issues de OPS                                     | false",
    })
    void a_summary_reads_the_issue_first(String message, boolean read) throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"OK\"}"));
        lenient().when(material.read(any(), eq(message), anyList(), eq(true))).thenReturn(new IssueMaterial.Read(
            IssueMaterial.HEADER + "OPS-35 \"Iteration #35\": in Done, unassigned.\nDescription: none.\n",
            List.of(new AssistantRead.IssueRead("OPS-35", 3))));

        AssistantAnswer answer = service.run("acme", 7L, message);

        String system = systemPrompt();
        if (!read) {
            assertThat(system).doesNotContain("The issue to summarize");
            verify(material, never()).read(any(), any(), any(), Mockito.anyBoolean());
            assertThat(answer.read().issues()).isEmpty();
            return;
        }
        assertThat(system.indexOf("The issue to summarize")).isGreaterThan(system.indexOf("Plan to summarize:"));
        assertThat(system).contains("OPS-35 \"Iteration #35\": in Done, unassigned.");
        // La ligne grise : « read OPS-35 and 3 comments » (R123).
        assertThat(answer.read().issues()).containsExactly(new AssistantRead.IssueRead("OPS-35", 3));
    }

    @Test
    @DisplayName("R123 : ce que la personne joint se lit, le tableau d'un projet comme l'issue, sans demande de résumé")
    void what_the_person_attaches_is_read() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"OK\"}"));
        List<Screen> attached = List.of(new Screen(30L, 350L), new Screen(31L, null), new Screen(31L, null));
        when(material.read(any(), eq("qui devrait la prendre ?"), eq(attached), eq(false))).thenReturn(new IssueMaterial.Read(
            IssueMaterial.ATTACHED + "OPS-35 \"Iteration #35\": in Done, unassigned.\n", List.of(new AssistantRead.IssueRead("OPS-35", 0))));
        when(screens.attached(any(), eq(31L))).thenReturn(new ScreenContext.Seen(
            ScreenContext.ATTACHED + "Project WEB \"Website\".\n", "WEB", 4, null));

        AssistantAnswer answer = service.run("acme", 7L, "qui devrait la prendre ?", TurnHistory.of(List.of()), Screen.NONE, attached);

        String system = systemPrompt();
        assertThat(system).contains("Project WEB \"Website\".").contains("OPS-35 \"Iteration #35\"");
        assertThat(system.indexOf("Project WEB")).isLessThan(system.indexOf("OPS-35 \"Iteration"));
        // Le même projet joint deux fois ne se lit qu'une fois.
        verify(screens).attached(any(), eq(31L));
        assertThat(answer.read().boards()).containsExactly(new AssistantRead.BoardRead("WEB", 4, null));
        assertThat(answer.read().issues()).containsExactly(new AssistantRead.IssueRead("OPS-35", 0));
    }

    @Test
    @DisplayName("R123 : un projet joint qui est déjà celui de l'écran ne se relit pas")
    void an_attached_project_already_on_screen_is_not_read_again() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"OK\"}"));
        when(screens.read(any())).thenReturn(new ScreenContext.Seen("On screen.\nProject OPS \"Ops\".\n", "OPS", 2, "OPS-35"));

        AssistantAnswer answer = service.run("acme", 7L, "quoi de neuf ?", TurnHistory.of(List.of()), new Screen(30L, 350L),
            List.of(new Screen(30L, null)));

        verify(screens, never()).attached(any(), any());
        verifyNoInteractions(material);
        assertThat(answer.read().boards()).containsExactly(new AssistantRead.BoardRead("OPS", 2, "OPS-35"));
    }

    /**
     * Test du CEO du 05/11/2026 : une réponse donnée se redemandait. Chaque envoi d'une carte note ses questions dans les
     * arguments du geste, après celles des cartes d'avant ; une valeur d'une autre forme ne compte pas.
     */
    @ParameterizedTest(name = "avant {0}, carte {1} : {2}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "-                         | name,repository | name,repository",
        "[\"name\",\"repository\"] | repository      | name,repository,repository",
        "\"oops\"                  | name            | name",
    })
    void the_answered_questions_are_marked(String before, String card, String marked) throws Exception {
        ObjectNode args = (ObjectNode) json.readTree(before == null ? "{}" : "{\"answered\": " + before + "}");
        List<Question> questions = java.util.Arrays.stream(card.split(","))
            .map(field -> Question.free(field, field, "?")).toList();

        AgentService.markAnswered(args, questions);

        assertThat(json.convertValue(args.get(Question.ANSWERED), List.class)).isEqualTo(List.of(marked.split(",")));
    }

    @Test
    @DisplayName("R115 : l'issue que le geste a résolue est celle que la carte montre et que l'accord reprend")
    void the_card_carries_the_issue_the_gesture_resolved() throws Exception {
        modelCalls("delete_issue", "{\"issue\":\"in review by AI\"}", "Check the card.");
        CortexGesture tool = gesture("delete_issue", "issue.delete");
        when(tool.ask(any(), any())).thenReturn(Map.of("issue", "TESTTA-2", "projectId", 12, "issueId", 22));
        when(tool.preview(any(), any())).thenReturn(new CortexGesture.Done("Deleting TESTTA-2 removes it for good.",
            Map.of("issueId", 22, "key", "TESTTA-2"), null));

        AssistantAnswer answer = service.run("acme", 7L, "supprime l issue qu il y a dans in review by AI");

        assertThat(answer.toolCalls().get(0).status()).isEqualTo("pending");
        assertThat(json.readTree(answer.toolCalls().get(0).input()).path("issue").asText()).isEqualTo("TESTTA-2");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> previewed = ArgumentCaptor.forClass(Map.class);
        verify(tool).preview(previewed.capture(), any());
        assertThat(previewed.getValue()).containsEntry("issueId", 22);
    }

    /**
     * Ce que le dossier a gardé de la carte : les arguments du geste, ses questions, l'écran. Une carte d'avant le
     * 05/11/2026 n'a qu'une question, sous {@code question}.
     */
    private JsonNode askedBefore(String arguments, String questions) throws Exception {
        return json.readTree("{\"tool\":\"x\",\"status\":\"question\",\"arguments\":" + json.writeValueAsString(arguments)
            + ",\"questions\":" + questions + ",\"screen\":{\"projectId\":12,\"issueId\":null}}");
    }

    private static final String WHICH_ISSUE = "[{\"field\":\"issue\",\"header\":\"Issue\",\"text\":\"?\",\"choices\":"
        + "[{\"value\":\"TESTTA-2\",\"label\":\"TESTTA-2 Ajouter\",\"description\":\"In review by AI\"}]}]";

    /** La carte de « crée un projet Next.js » : le nom, et où vit son code, dans la même carte. */
    private static final String NAME_AND_REPOSITORY = "[{\"field\":\"name\",\"header\":\"Name\",\"text\":\"?\","
        + "\"choices\":[{\"value\":\"Next.js app\",\"label\":\"Next.js app\"}]},"
        + "{\"field\":\"repository\",\"header\":\"Repository\",\"text\":\"?\",\"choices\":["
        + "{\"value\":\"new-private\",\"label\":\"A new private repository\",\"recommended\":true},"
        + "{\"value\":\"none\",\"label\":\"No repository for now\"}]}]";

    private CortexGesture answering(String name, String action, JsonNode asked) {
        stubWorkspace();
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        when(records.question(RECORD, name, "sha256:q1")).thenReturn(Optional.of(asked));
        lenient().when(records.answer(eq(RECORD), eq(name), eq("sha256:q1"), eq(7L), any())).thenReturn(Optional.of(asked));
        CortexGesture tool = Mockito.mock(CortexGesture.class);
        lenient().when(tool.name()).thenReturn(name);
        lenient().when(tool.action()).thenReturn(action);
        when(tools.get(name)).thenReturn(tool);
        lenient().when(tool.ask(any(), any())).thenAnswer(inv -> inv.getArgument(0));
        return tool;
    }

    private static Question.Answer clicked(String field, String... values) {
        return new Question.Answer(field, List.of(values), null);
    }

    private static Question.Answer typed(String field, String other) {
        return new Question.Answer(field, List.of(), other);
    }

    /** La carte d'avant le 05/11/2026 garde sa question seule ; elle se répond pareil. */
    @ParameterizedTest(name = "carte {0}")
    @ValueSource(strings = {"questions", "question"})
    @DisplayName("R115 : le clic de la personne reprend le geste : la carte de suppression de l'issue choisie")
    void the_answer_resumes_the_gesture(String kept) throws Exception {
        JsonNode asked = askedBefore("{}", WHICH_ISSUE);
        if ("question".equals(kept)) {
            ObjectNode old = (ObjectNode) asked;
            old.set("question", old.remove("questions").get(0));
        }
        CortexGesture tool = answering("delete_issue", "issue.delete", asked);
        when(tool.preview(any(), any())).thenReturn(new CortexGesture.Done("Deleting TESTTA-2 removes it for good.",
            Map.of("issueId", 22, "key", "TESTTA-2"), null));

        AssistantToolCall next = service.answer("acme", 7L, "delete_issue", RECORD.toString(), "sha256:q1",
            List.of(clicked("issue", "TESTTA-2")));

        assertThat(next.status()).isEqualTo("pending");
        assertThat(next.record()).isEqualTo(RECORD.toString());
        assertThat(next.target()).containsEntry("key", "TESTTA-2");
        assertThat(json.readTree(next.input()).path("issue").asText()).isEqualTo("TESTTA-2");
        ArgumentCaptor<AgentContext> ctx = ArgumentCaptor.forClass(AgentContext.class);
        verify(tool).preview(any(), ctx.capture());
        assertThat(ctx.getValue().screen()).isEqualTo(new Screen(12L, null)); // l'écran de la question
        // Rejugée par les règles de l'espace, au même dossier ; la réponse y entre comme la décision de la personne.
        verify(records).append(eq(RECORD), eq("action.decided"), any(), any());
        verify(records).answer(RECORD, "delete_issue", "sha256:q1", 7L, Map.of("issue", "TESTTA-2"));
        verify(llm, never()).rawChat(anyList(), anyList(), anyString());
    }

    @Test
    @DisplayName("R115 : les deux réponses d'une carte partent d'un envoi, et le geste reprend avec les deux")
    @SuppressWarnings("unchecked")
    void the_two_answers_of_a_card_go_at_once() throws Exception {
        CortexGesture tool = answering("create_project", "project.create", askedBefore("{\"stack\":\"Next.js\"}", NAME_AND_REPOSITORY));
        when(tool.perform(any(), any())).thenReturn(new CortexGesture.Done("Project created in TaskForce: ATLAS \"Atlas\" (id 31). "
            + "Its new private repository acme/atlas is linked.", null, Map.of("projectId", 31L)));

        AssistantToolCall done = service.answer("acme", 7L, "create_project", RECORD.toString(), "sha256:q1",
            List.of(typed("name", "Atlas"), clicked("repository", "new-private")));

        assertThat(done.status()).isEqualTo("success");
        assertThat(done.output()).startsWith("Project created in TaskForce: ATLAS");
        assertThat(done.questions()).isNull();
        ArgumentCaptor<Map<String, Object>> args = ArgumentCaptor.forClass(Map.class);
        verify(tool).perform(args.capture(), any());
        assertThat(args.getValue()).containsEntry("name", "Atlas").containsEntry("repository", "new-private")
            .containsEntry("stack", "Next.js")
            // Le geste sait que ces deux valeurs viennent de la personne : il ne les redemandera pas.
            .containsEntry(Question.ANSWERED, List.of("name", "repository"));
        Map<String, String> said = new LinkedHashMap<>();
        said.put("name", "Atlas");
        said.put("repository", "new-private");
        verify(records).answer(RECORD, "create_project", "sha256:q1", 7L, said);
    }

    @Test
    @DisplayName("R115 : des réponses peuvent amener la carte suivante, au même dossier")
    void an_answer_can_lead_to_the_next_card() throws Exception {
        CortexGesture tool = answering("create_project", "project.create", askedBefore("{\"stack\":\"Next.js\"}", NAME_AND_REPOSITORY));
        when(tool.perform(any(), any())).thenThrow(new QuestionNeeded(Question.of("repository", "Repository",
            "\"the usual one\" isn't a repository: write it as owner/name. Where does the code of Next.js app live?", List.of(
                Question.Choice.recommended("new-private", "A new private repository", "Only the people you add see the code"),
                Question.Choice.of("none", "No repository for now", "Link one later from the project's page")))));

        AssistantToolCall next = service.answer("acme", 7L, "create_project", RECORD.toString(), "sha256:q1",
            List.of(clicked("name", "Next.js app"), typed("repository", "the usual one")));

        assertThat(next.status()).isEqualTo(AgentService.QUESTION);
        assertThat(next.questions()).singleElement().satisfies(question -> {
            assertThat(question.header()).isEqualTo("Repository");
            assertThat(question.choices()).extracting(AssistantAnswer.AssistantChoice::description)
                .containsExactly("Only the people you add see the code", "Link one later from the project's page");
        });
        assertThat(next.ref()).isEqualTo("hash");
        assertThat(json.readTree(next.input()).path("name").asText()).isEqualTo("Next.js app");
        // Ce qui est tapé et ne se lit pas parmi les choix part tel quel : le geste le juge.
        assertThat(json.readTree(next.input()).path("repository").asText()).isEqualTo("the usual one");
    }

    /** Une carte déjà répondue ne se répond plus ; le dossier d'un autre ne se prolonge pas. */
    @ParameterizedTest(name = "dossier à soi {0}")
    @ValueSource(booleans = {true, false})
    void an_answer_is_refused(boolean owns) {
        stubWorkspace();
        when(records.owns(eq(RECORD), any())).thenReturn(owns);
        CortexGesture tool = gesture("delete_issue", "issue.delete");
        lenient().when(tools.get("delete_issue")).thenReturn(tool);
        lenient().when(records.question(any(), any(), any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.answer("acme", 7L, "delete_issue", RECORD.toString(), "sha256:q1",
                List.of(clicked("issue", "TESTTA-2"))))
            .isInstanceOf(owns ? BusinessException.class : ResourceNotFoundException.class);
        verify(tool, never()).preview(any(), any());
        verify(records, never()).answer(any(), any(), any(), any(), any());
    }

    /**
     * Une réponse écrite comme « champ=choix1+choix2/tapé » : les choix cochés avant la barre, ce qui est tapé dans
     * « Other » après.
     */
    private static Question.Answer said(String answer) {
        String field = answer.substring(0, answer.indexOf('='));
        String[] parts = answer.substring(answer.indexOf('=') + 1).split("/", -1);
        List<String> values = parts[0].isEmpty() ? List.of() : List.of(parts[0].split("\\+"));
        return new Question.Answer(field, values, parts.length > 1 ? parts[1] : null);
    }

    /**
     * Une carte se répond en entier, par des clics sur ses choix ou des mots tapés : une réponse qui manque, en trop,
     * un choix qui n'est pas sur la carte, deux réponses à une question qui n'en prend qu'une. Rien n'entre au dossier, et
     * la carte reste ouverte, à corriger.
     */
    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', quoteCharacter = '`', value = {
        "name=/Atlas                              | Answer Repository: pick one of the choices, or write your answer.",
        "name=/Atlas;repository=/                 | Answer Repository: pick one of the choices, or write your answer.",
        "name=/Atlas;repository=new-private/;stack=/Vue | This card has no other question to answer.",
        "name=/Atlas;name=/Orion;repository=none/ | This card has no other question to answer.",
        "name=/Atlas;repository=public/           | \"public\" isn't a choice of Repository: write it as your own answer.",
        "name=/Atlas;repository=none+new-private/ | Pick one answer for Repository.",
        "name=/Atlas;repository=none/mine         | Pick one answer for Repository.",
    })
    void an_incomplete_card_is_refused(String answers, String why) throws Exception {
        CortexGesture tool = answering("create_project", "project.create", askedBefore("{\"stack\":\"Next.js\"}", NAME_AND_REPOSITORY));
        List<Question.Answer> sent = java.util.Arrays.stream(answers.split(";")).map(AgentServiceTest::said).toList();

        assertThatThrownBy(() -> service.answer("acme", 7L, "create_project", RECORD.toString(), "sha256:q1", sent))
            .isInstanceOf(BusinessException.class).hasMessage(why);
        verify(records, never()).answer(any(), any(), any(), any(), any());
        verify(tool, never()).perform(any(), any());
    }

    /**
     * Ce que reçoit le geste : un choix coché, ou ce qui est tapé lu parmi les choix ; une question dont plusieurs choix se
     * cochent remplit une liste, ce qui est tapé coupé aux virgules.
     */
    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(delimiter = '|', quoteCharacter = '`', value = {
        "issue=TESTTA-3/          | {\"issue\":\"TESTTA-3\"}",
        "issue=/login             | {\"issue\":\"TESTTA-3\"}",
        "issue=/todo              | {\"issue\":\"TESTTA-3\"}",
        "issue=/TF-99             | {\"issue\":\"TF-99\"}",
        "addLabels=bug+ui/        | {\"addLabels\":[\"bug\",\"ui\"]}",
        "addLabels=bug/UI, docs   | {\"addLabels\":[\"bug\",\"ui\",\"docs\"]}",
        "addLabels=/Bug           | {\"addLabels\":[\"bug\"]}",
    })
    void the_answers_fill_the_gesture(String answer, String expected) throws Exception {
        List<Question> card = List.of(WHICH, Question.several("addLabels", "Labels", "Which labels?", List.of(
            Question.Choice.recommended("bug", "bug", "Something is broken"), Question.Choice.of("ui", "ui", null))));
        Question.Answer given = said(answer);
        ObjectNode args = json.createObjectNode();

        Map<String, String> kept = AgentService.filled(args,
            card.stream().filter(question -> question.field().equals(given.field())).toList(), List.of(given));

        assertThat(args).isEqualTo(json.readTree(expected));
        assertThat(kept).containsKey(given.field());
    }

    /**
     * Cortex n'a rien dit (décision du CEO, 02/11/2026) : TaskForce dit ce qui s'est passé, signé comme ses corrections
     * (R116). Une ligne par appel du tour, dans l'ordre ; une réponse écrite reste celle de Cortex.
     */
    @ParameterizedTest(name = "« {0} » après {1} [{2}] : {3}")
    @CsvSource(delimiter = '|', quoteCharacter = '`', nullValues = "-", value = {
        "        | -                  | -        | -                                      | Cortex didn't answer. Nothing was done.",
        "   \\n   | -                  | -        | -                                      | Cortex didn't answer. Nothing was done.",
        "        | create_issue       | pending  | Issue prepared as a card               | Cortex didn't answer.~Nothing is created yet: check the issue below, then create it.",
        "        | linear__save_issue | pending  | Action proposed                        | Cortex didn't answer.~Nothing has changed yet: the action below waits for your approval.",
        "        | update_issue       | success  | Updated TF-12 \"Fix login\": column from Todo to Done. | Cortex didn't answer.~Updated TF-12 \"Fix login\": column from Todo to Done.",
        "        | list_issues        | success  | Issues in TaskForce (2):\\n- TF-1 A\\n- TF-2 B | Cortex didn't answer.~What it read or did shows below.",
        "        | update_issue       | refused  | Not run: the rules refuse it.          | Cortex didn't answer.~Nothing was done: the rules of this workspace refuse it.",
        "        | update_issue       | error    | Tool update_issue failed: There is no issue TF-99. | Cortex didn't answer.~An action failed, so nothing was done: There is no issue TF-99.",
        "        | delete_issue       | question | Nothing was done: TaskForce asks first. | Cortex didn't answer.~TaskForce asks a question below.",
        "Done.   | update_issue       | success  | Updated TF-12.                         | -",
    })
    void taskforce_speaks_when_cortex_says_nothing(String answer, String tool, String status, String output, String said) {
        String written = answer == null ? "" : answer.replace("\\n", "\n");
        List<AssistantToolCall> calls = tool == null ? List.of()
            : List.of(new AssistantToolCall(tool, status, "{}", output.replace("\\n", "\n"), "r"));

        String shown = AgentService.silentAnswer(written, calls);

        if (said == null) {
            assertThat(shown).isEqualTo(written);
            return;
        }
        StringBuilder expected = new StringBuilder("> [!taskforce] TaskForce");
        for (String line : said.split("~")) expected.append("\n> ").append(line);
        assertThat(shown).isEqualTo(expected.append('\n').toString());
    }

    @Test
    @DisplayName("Cortex n'a rien dit après un geste : la réponse est celle de TaskForce, qui redit le geste, signée")
    void an_empty_answer_after_a_gesture_is_taskforces() throws Exception {
        modelCalls("update_issue", "{\"issue\":\"TF-12\",\"status\":\"Done\"}", "");
        CortexGesture tool = gesture("update_issue", "issue.update");
        when(tool.perform(any(), any())).thenReturn(new CortexGesture.Done("Updated TF-12 \"Fix login\": column from Todo "
            + "to Done.", Map.of("issueId", 5), Map.of("fields", Map.of())));

        AssistantAnswer answer = service.run("acme", 7L, "move TF-12 to Done");

        assertThat(answer.answer()).isEqualTo("> [!taskforce] TaskForce\n> Cortex didn't answer.\n> Updated TF-12 \"Fix login\": "
            + "column from Todo to Done.\n");
        assertThat(answer.steps()).last().satisfies(step -> assertThat(step.description())
            .isEqualTo("Cortex said nothing: TaskForce said what happened"));
    }

    /** Une réponse tapée se lit parmi les choix : leur valeur, leur libellé, ou le seul dont le libellé ou la ligne la contient. */
    @ParameterizedTest(name = "« {0} » : {1}")
    @CsvSource({
        "TESTTA-2, TESTTA-2",
        "testta-3, TESTTA-3",
        "login,    TESTTA-3",
        "Ajouter,  TESTTA-2",
        "review,   TESTTA-2",  // la ligne du choix : sa colonne
        "TESTTA,   TESTTA",    // deux choix le contiennent : la réponse telle quelle, que le geste juge
        "x,        x",
        "TF-99,    TF-99",
    })
    void a_typed_answer_is_read_among_the_choices(String said, String value) {
        assertThat(AgentService.chosen(WHICH, said)).isEqualTo(value);
    }

    // -------------------------------------------------------------------------
    // Le contexte selon le modèle (TF-J1-13)
    // -------------------------------------------------------------------------

    private void stubHeavyTools(String description) {
        when(workspaceMcp.toolsFor(any())).thenReturn(List.of());
        when(tools.toolDefinitions(anyList())).thenReturn(List.of(Map.of("type", "function",
            "function", Map.of("name", "search_brain", "description", description))));
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
    }

    @Test
    @DisplayName("TF-J1-13 : une demande trop grande pour le modèle : TaskForce le dit, sans appel, avec la taille, la fenêtre et un modèle qui la tient")
    void a_request_too_big_is_said_plainly() throws Exception {
        stubWorkspace();
        stubHeavyTools("d".repeat(12_000));
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("tiny:1b", 4_096, false, 1_024));
        when(llm.largerWindow(eq("fast"), anyInt())).thenReturn(Optional.of(new ModelWindow("qwen3:8b", 16_384, false, 2_048)));

        AssistantAnswer answer = service.run("acme", 7L, "Give me the status of the project");

        assertThat(answer.mode()).isEqualTo("fallback");
        assertThat(answer.model()).isNull();
        assertThat(answer.answer()).startsWith(ActionClaimCheck.SIGNATURE).contains("This request is about ").contains(" tokens, and tiny:1b's context window is 4,096, so it wasn't sent.");
        assertThat(answer.offer().from()).isEqualTo("tiny:1b");
        assertThat(answer.offer().to()).isEqualTo("qwen3:8b");
        assertThat(answer.offer().text()).contains("qwen3:8b's context window is 16,384").contains("send this request to qwen3:8b");
        assertThat(answer.steps().get(answer.steps().size() - 1).status()).isEqualTo("error");
        verify(llm, never()).rawChat(anyList(), anyList(), anyString());
        verify(aiUsageService).record(eq(1L), any());
    }

    @Test
    @DisplayName("TF-J1-13 : une fenêtre que le fournisseur ne dit pas se donne pour ce qu'elle est, et sans plus grand modèle, rien n'est proposé")
    void an_unknown_window_is_said_as_an_estimate() throws Exception {
        stubWorkspace();
        stubHeavyTools("d".repeat(60_000));
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("gpt-x", 16_384, true, 2_048));

        AssistantAnswer answer = service.run("acme", 7L, "Give me the status of the project");

        assertThat(answer.answer()).contains("gpt-x's context window is about 16,384");
        assertThat(answer.offer()).isNull();
    }

    @Test
    @DisplayName("TF-J1-13 : l'historique vient du budget de cette requête, et ce qui a dû changer entre dans la ligne grise")
    void the_history_comes_from_the_budget_of_the_request() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"Zephyr.\"}"));
        List<ContextBudget> budgets = new ArrayList<>();
        List<Map<String, Object>> history = List.of(Map.of("role", "system", "content", "Summary: Zephyr"));
        TurnHistory memory = (budget, tier) -> {
            budgets.add(budget);
            return new TurnHistory.Fitted(history, 12, 3);
        };

        AssistantAnswer answer = service.run("acme", 7L, "Remind me of its name", memory, Screen.NONE, List.of());

        assertThat(budgets).singleElement().satisfies(budget -> {
            assertThat(budget.window().tokens()).isEqualTo(16_384);
            assertThat(budget.system()).isPositive();
            assertThat(budget.message()).isPositive();
            assertThat(budget.attached()).isZero();
        });
        assertThat(answer.read().context()).isEqualTo(new AssistantRead.ContextRead(12, 3, 0));
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> captor = ArgumentCaptor.forClass(List.class);
        verify(llm).rawChat(captor.capture(), anyList(), eq("fast"));
        assertThat(captor.getValue()).hasSize(3);
        assertThat(captor.getValue().get(1)).containsEntry("content", "Summary: Zephyr");
    }

    @Test
    @DisplayName("TF-J1-13 : ce que la personne a à l'écran compte comme ce qu'elle a joint")
    void what_is_on_screen_counts_as_attached() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"OK\"}"));
        when(screens.read(any())).thenReturn(new ScreenContext.Seen("On screen.\nProject OPS \"Ops\".\n", "OPS", 2, null));
        List<ContextBudget> budgets = new ArrayList<>();

        service.run("acme", 7L, "quoi de neuf ?", (budget, tier) -> {
            budgets.add(budget);
            return TurnHistory.Fitted.NONE;
        }, new Screen(30L, null), List.of());

        assertThat(budgets.get(0).attached()).isEqualTo(ContextBudget.tokens("On screen.\nProject OPS \"Ops\".\n"));
    }

    @Test
    @DisplayName("TF-J1-13 : une salutation passe par le même budget, sans outils")
    void a_greeting_goes_through_the_same_budget() throws Exception {
        stubWorkspace();
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 8_192, false, 2_048));
        when(llm.chat(anyList(), eq("fast"))).thenReturn("Hello!");
        List<ContextBudget> budgets = new ArrayList<>();

        AssistantAnswer answer = service.run("acme", 7L, "Hello", (budget, tier) -> {
            budgets.add(budget);
            return new TurnHistory.Fitted(List.of(), 4, 0);
        }, Screen.NONE, List.of());

        assertThat(answer.answer()).isEqualTo("Hello!");
        assertThat(budgets.get(0).tools()).isZero();
        assertThat(answer.read().context()).isEqualTo(new AssistantRead.ContextRead(4, 0, 0));
    }

    @Test
    @DisplayName("TF-J1-13 : rien de condensé ni de coupé, rien de dit : la ligne grise n'a pas de contexte")
    void nothing_fitted_nothing_said() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"OK\"}"));

        AssistantAnswer answer = service.run("acme", 7L, "Give me the status of the project");

        assertThat(answer.read().context()).isNull();
    }

    @Test
    @DisplayName("TF-J1-13 : un résultat d'outil trop long ne fait pas déborder la fenêtre : le modèle lit ce qui tient et le sait, la ligne grise aussi")
    void a_long_tool_result_stays_inside_the_window() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 8_192, false, 2_048));
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"search_brain\",\"arguments\":\"{}\"}}]}"),
            json.readTree("{\"content\":\"Final answer\"}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tool.name()).thenReturn("search_brain");
        when(tools.get(eq("search_brain"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("r".repeat(60_000));

        AssistantAnswer answer = service.run("acme", 7L, "Analyze the project and propose a plan");

        assertThat(answer.answer()).isEqualTo("Final answer");
        assertThat(answer.read().context()).isEqualTo(new AssistantRead.ContextRead(0, 0, 1));
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> captor = ArgumentCaptor.forClass(List.class);
        verify(llm, Mockito.times(2)).rawChat(captor.capture(), anyList(), anyString());
        Map<String, Object> result = captor.getValue().stream().filter(m -> "tool".equals(m.get("role"))).findFirst().orElseThrow();
        assertThat((String) result.get("content")).endsWith(ToolLoopFit.SHORTENED);
    }

    @Test
    @DisplayName("TF-J1-13 : quand même raccourci rien ne tient plus, la boucle s'arrête et le dit, sans rien envoyer de trop")
    void a_loop_that_no_longer_fits_stops_and_says_so() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 8_192, false, 2_048));
        // Un appel d'outil dont les arguments, écrits par le modèle, dépassent à eux seuls la fenêtre.
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"search_brain\",\"arguments\":\"{\\\"q\\\":\\\"" + "x".repeat(30_000) + "\\\"}\"}}]}"));
        AgentTool tool = Mockito.mock(AgentTool.class);
        when(tool.name()).thenReturn("search_brain");
        when(tools.get(eq("search_brain"), anyList())).thenReturn(tool);
        when(tool.execute(any(), any())).thenReturn("short");

        AssistantAnswer answer = service.run("acme", 7L, "Analyze the project and propose a plan");

        assertThat(answer.answer()).contains("no longer fits this model's context");
        verify(llm, Mockito.times(1)).rawChat(anyList(), anyList(), anyString());
    }

    /** Une carte de deux questions se dit en deux lignes, signées par TaskForce, que la conversation rouverte relit. */
    @Test
    void the_card_is_said_in_the_answer_one_question_a_line() {
        List<Question> card = List.of(Question.free("name", "Name", "What should the project be called?"),
            Question.of("repository", "Repository", "Where does its code live?", List.of()));
        List<AssistantToolCall> calls = List.of(new AssistantToolCall("create_project", AgentService.QUESTION, "{}", "...",
            "r", "q", null, AgentService.card(card)));

        assertThat(AgentService.askedAnswer(AgentService.asking(card), calls)).isEqualTo("> [!taskforce] TaskForce · asks\n"
            + "> What should the project be called?\n> Where does its code live?\n");
        assertThat(AgentService.askedAnswer("Something else.", calls)).isEqualTo("Something else.");
        assertThat(AgentService.silentAnswer("", calls)).isEqualTo("> [!taskforce] TaskForce\n> Cortex didn't answer.\n"
            + "> What should the project be called?\n> Where does its code live?\n");
    }
}
