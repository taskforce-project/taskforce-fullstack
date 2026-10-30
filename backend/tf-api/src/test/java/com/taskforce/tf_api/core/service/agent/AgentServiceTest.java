package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
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
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantActionResult;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
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
import com.taskforce.tf_api.core.service.LlmToolsRefusedException;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
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
        when(tool.name()).thenReturn("search_brain");
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
        assertThat(answer.answer()).startsWith("> [!warning] Cortex could not act").contains("nothing was created or changed");
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
        when(tool.name()).thenReturn("create_issue");
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
        when(tool.name()).thenReturn("create_issue");
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
        List<AssistantToolCall> calls = List.of(new AssistantToolCall("linear__save_issue", "pending", "{}", "proposed", null));

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
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
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
        "create_issue,   success", // issue.create : autorisée, se défait
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
    @DisplayName("tracer avant d'agir : la demande puis la décision au dossier avant l'outil, le résultat après")
    void every_tool_is_recorded_before_it_runs() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        when(tool.execute(any(), any())).thenReturn("Created TF-31");

        service.run("acme", 7L, "Create an issue \"Release notes\"");

        InOrder order = Mockito.inOrder(records, tool);
        order.verify(records).open(any(), eq("Create an issue \"Release notes\""), any());
        order.verify(records).append(eq(RECORD), eq("action.requested"), eq(CortexRecordService.Actor.CORTEX), any());
        order.verify(records).append(eq(RECORD), eq("action.decided"), eq(CortexRecordService.Actor.rule("create-issue")), any());
        order.verify(tool).execute(any(), any());
        order.verify(records).append(eq(RECORD), eq("action.result"), eq(CortexRecordService.Actor.SERVER), any());
    }

    @Test
    @DisplayName("une réponse sans outil n'ouvre pas de dossier")
    void no_tool_no_record() throws Exception {
        stubWorkspace();
        stubToolLoop();
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
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
    @DisplayName("une création refusée par les règles ne se dit pas faite")
    void refused_write_is_not_announced_as_done() {
        List<AssistantToolCall> calls = List.of(new AssistantToolCall("create_issue", "refused", "{}", "Not run", null));

        String answer = AgentService.honestAnswer("Create an issue \"X\"", "Issue created: X.", calls);

        assertThat(answer).isEqualTo("Nothing was created: the rules of this workspace refuse this action.");
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

    // -------------------------------------------------------------------------
    // Le modèle au dossier et le rejeu d'un cas de la banque
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("le dossier garde ce qui a répondu : le modèle, le tier, les notes servies")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void the_record_keeps_what_answered() throws Exception {
        AgentTool tool = stubInternalCall("create_issue");
        when(tool.execute(any(), any())).thenReturn("Created TF-31");
        when(llm.currentModel()).thenReturn("qwen3:8b");

        service.run("acme", 7L, "Create an issue \"Release notes\"");

        ArgumentCaptor<Map<String, Object>> origin = (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
        verify(records).open(any(), eq("Create an issue \"Release notes\""), origin.capture());
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
        verify(search, never()).retrieveRelevant(anyLong(), anyString(), anyInt());
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
    @DisplayName("undo défait par le dossier de la personne, et dit ce qui est défait")
    @SuppressWarnings("unchecked")
    void undo_goes_through_the_record() {
        stubWorkspace();
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        when(undo.handles("create_project")).thenReturn(true);
        when(records.undo(eq(RECORD), eq("create_project"), eq(7L), any())).thenAnswer(inv ->
            Optional.of(((java.util.function.UnaryOperator<String>) inv.getArgument(3)).apply("Project created in TaskForce: X")));
        when(undo.undo(eq("create_project"), eq("Project created in TaskForce: X"), any())).thenReturn("Removed the project X.");

        AssistantActionResult result = service.undo("acme", 7L, "create_project", RECORD.toString());

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
        lenient().when(records.undo(eq(RECORD), eq("create_issue"), eq(7L), any()))
            .thenReturn(somethingToUndo ? Optional.of("done") : Optional.empty());

        assertThatThrownBy(() -> service.undo("acme", 7L, "create_issue", RECORD.toString()))
            .isInstanceOf(owns ? BusinessException.class : ResourceNotFoundException.class);
    }
}
