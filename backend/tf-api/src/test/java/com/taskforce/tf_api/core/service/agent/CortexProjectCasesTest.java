package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantToolCall;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AiConversationService;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.TurnInput.LastCard;
import com.taskforce.tf_api.core.service.agent.tools.CreateIssueTool;
import com.taskforce.tf_api.core.service.agent.tools.ProjectResolver;
import com.taskforce.tf_api.core.service.ai.TurnHistory;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Les cas de la recette 1.13 rejoués, notés par du code (R135, séance n°20 ; la preuve dit : « le cas de l'étape 15 rejoué :
 * une question, pas une carte dans un projet supposé »). Le modèle est scripté, tout le reste est vrai : le noyau, l'outil qui
 * prépare la carte, la résolution du projet. Trois situations, plus la correction :
 * <ol>
 *   <li>la demande nomme un projet : la carte y est préparée, quels que soient l'écran et la conversation ;</li>
 *   <li>elle n'en nomme pas, et la conversation en a un : la carte y est préparée, jamais celui que le modèle a lu à l'écran ;</li>
 *   <li>ni l'un ni l'autre : TaskForce demande lequel, avec les projets en choix, et aucune carte n'existe ;</li>
 *   <li>« tu t'es trompé de projet » : le même choix, sans appel au modèle, sans description inventée.</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("Cortex : le projet d'un geste, cas notés par le code (R135)")
class CortexProjectCasesTest {

    private static final UUID RECORD = UUID.fromString("00000000-0000-0000-0000-0000000000aa");
    private static final Long SOLO = 3L;
    private static final Long WEB = 5L;

    @Mock private BrainAccessGuard access;
    @Mock private BrainSearchService search;
    @Mock private AgentToolRegistry tools;
    @Mock private LlmClient llm;
    @Mock private AiUsageService aiUsage;
    @Mock private WorkspaceMcpService workspaceMcp;
    @Mock private AuthorizationService authorization;
    @Mock private CortexRecordService records;
    @Mock private CortexUndo undo;
    @Mock private ScreenContext screens;
    @Mock private IssueMaterial material;
    @Mock private AiConversationService conversations;
    @Mock private ProjectService projectService;
    @Mock private IssueService issueService;
    @Mock private CycleService cycleService;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private WorkspaceRepository workspaces;
    @Mock private com.taskforce.tf_api.core.repository.WorkspaceMemberRepository members;
    @Mock private com.taskforce.tf_api.core.repository.ProjectMemberRepository projectMembers;
    @Mock private com.taskforce.tf_api.core.repository.ProjectRepository projectRepository;
    @Mock private com.taskforce.tf_api.core.repository.IssueRepository issueRepository;

    private final ObjectMapper json = new ObjectMapper();
    private AgentService service;

    @BeforeEach
    void realKernelAndRealTool() {
        Workspace ws = Workspace.builder().id(1L).slug("acme").name("Acme")
            .owner(User.builder().email("owner@acme.test").build()).build();
        when(workspaces.findById(1L)).thenReturn(Optional.of(ws));
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(ws);
        when(search.retrieveRelevant(any(), anyString(), anyInt())).thenReturn(List.of());
        when(llm.isConfigured()).thenReturn(true);
        when(tools.toolDefinitions(anyList())).thenReturn(List.of());
        when(workspaceMcp.toolsFor(any())).thenReturn(List.of());
        when(records.open(any(), any(), any())).thenReturn(RECORD);
        when(records.append(any(), any(), any(), any())).thenReturn(Optional.of("hash"));
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            project(SOLO, "SOLO", "Solo Initiatives"), project(WEB, "WEB", "Website"), project(8L, "OPS", "Operations")));

        ProjectResolver resolver = new ProjectResolver(projectService);
        CreateIssueTool createIssue = new CreateIssueTool(issueService, resolver, projectService, cycleService);
        when(tools.get(eq("create_issue"), anyList())).thenReturn(createIssue);
        when(tools.get("create_issue")).thenReturn(createIssue);

        service = new AgentService(access, search, tools, llm, json, aiUsage, workspaceMcp, authorization,
            new CortexGate(new HarnessRulesService(ruleSets, members), workspaces, projectRepository, issueRepository, json),
            new com.taskforce.tf_api.core.service.rules.RuleApprovers(members, projectMembers), records, undo, screens, material,
            resolver, conversations);
    }

    private static ProjectResponse project(Long id, String key, String name) {
        return ProjectResponse.builder().id(id).identifier(key).name(name).build();
    }

    /** Le modèle demande la carte avec ces arguments, puis répond. */
    private void modelCallsCreateIssue(String args) throws Exception {
        String arguments = json.writeValueAsString(args);
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(
            json.readTree("{\"tool_calls\":[{\"id\":\"c1\",\"function\":{\"name\":\"create_issue\",\"arguments\":" + arguments + "}}]}"),
            json.readTree("{\"content\":\"La carte est prête.\"}"));
    }

    private AssistantAnswer ask(String request, Long screen, Long conversationProject, LastCard last) {
        return service.run("acme", 7L, new TurnInput(request, TurnHistory.of(List.of()), new Screen(screen, null), List.of(), List.of(),
            1L, conversationProject, last));
    }

    private JsonNode inputOf(AssistantToolCall call) throws Exception {
        return json.readTree(call.input());
    }

    static Stream<Arguments> aCardGoesWhereItShould() {
        return Stream.of(
            // 1. La demande nomme le projet : c'est lui, malgré l'écran et la conversation.
            Arguments.of("Crée une issue Test dans WEB", "{\"project\":\"WEB\",\"title\":\"Test\"}", SOLO, 8L, "WEB"),
            Arguments.of("Create an issue Test in Website", "{\"project\":\"Website\",\"title\":\"Test\"}", SOLO, 8L, "WEB"),
            Arguments.of("Crée une issue Test dans le projet WEB", "{\"title\":\"Test\"}", SOLO, 8L, "WEB"),
            // 2. Elle n'en nomme pas : le projet de la conversation, jamais celui que le modèle a lu à l'écran.
            Arguments.of("Crée une issue \"Test\"", "{\"project\":\"SOLO\",\"title\":\"Test\"}", SOLO, WEB, "WEB"),
            Arguments.of("Crée une issue \"Test\"", "{\"title\":\"Test\"}", SOLO, WEB, "WEB"),
            Arguments.of("Create an issue called Test", "{\"title\":\"Test\"}", null, WEB, "WEB"));
    }

    @ParameterizedTest(name = "« {0} » (écran {2}, conversation {3}) → {4}")
    @MethodSource
    void aCardGoesWhereItShould(String request, String args, Long screen, Long conversation, String key) throws Exception {
        modelCallsCreateIssue(args);

        AssistantAnswer answer = ask(request, screen, conversation, null);

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("pending");
            assertThat(inputOf(call).path("project").asText()).isEqualTo(key);
            assertThat(inputOf(call).path("title").asText()).isEqualTo("Test");
        });
    }

    static Stream<Arguments> withNeitherCortexAsks() {
        return Stream.of(
            // L'étape 15 de la recette : le modèle reprend le projet ouvert à l'écran. Il n'est pas retenu.
            Arguments.of("Crée une issue \"Test\"", "{\"project\":\"SOLO\",\"title\":\"Test\"}", SOLO),
            Arguments.of("Crée une issue \"Test\"", "{\"title\":\"Test\"}", SOLO),
            Arguments.of("Create an issue called Test", "{\"title\":\"Test\"}", null));
    }

    @ParameterizedTest(name = "« {0} » (écran {2}) : la carte des projets, aucune issue préparée")
    @MethodSource
    void withNeitherCortexAsks(String request, String args, Long screen) throws Exception {
        modelCallsCreateIssue(args);

        AssistantAnswer answer = ask(request, screen, null, null);

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo(AgentService.QUESTION);
            assertThat(call.record()).isEqualTo(RECORD.toString());
            assertThat(call.ref()).isEqualTo("hash");
            assertThat(call.questions()).singleElement().satisfies(question -> {
                assertThat(question.field()).isEqualTo("project");
                assertThat(question.text()).isEqualTo("Which project should \"Test\" go in?");
                assertThat(question.choices()).extracting(AssistantAnswer.AssistantChoice::label)
                    .contains("Solo Initiatives", "Website", "Operations");
                assertThat(question.choices()).noneMatch(AssistantAnswer.AssistantChoice::recommended);
            });
        });
        // La réponse dit la question, signée, et s'arrête là : rien n'est préparé.
        assertThat(answer.answer()).contains("Which project should \"Test\" go in?");
    }

    @ParameterizedTest(name = "« {0} » rouvre le choix, sans le modèle")
    @ValueSource(strings = {"oui mais tu t'es trompe de projet", "c'est pas le bon projet", "wrong project"})
    void aCorrectionOpensTheChoice(String message) throws Exception {
        LastCard last = new LastCard("create_issue", "{\"project\":\"SOLO\",\"title\":\"Test\",\"priority\":\"LOW\"}");

        AssistantAnswer answer = ask(message, SOLO, SOLO, last);

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo(AgentService.QUESTION);
            assertThat(call.questions()).singleElement().satisfies(question -> assertThat(question.field()).isEqualTo("project"));
            assertThat(inputOf(call).has("project")).isFalse();
            assertThat(inputOf(call).path("title").asText()).isEqualTo("Test");
            // Ce que la carte montrait repart tel quel : rien d'inventé.
            assertThat(inputOf(call).has("description")).isFalse();
            assertThat(inputOf(call).path("priority").asText()).isEqualTo("LOW");
        });
        verify(llm, never()).rawChat(anyList(), anyList(), anyString());
    }

    @Test
    @DisplayName("« pas le bon projet, c'est WEB » : la carte est refaite là, et la conversation y travaille")
    void aCorrectionThatNamesTheProject() throws Exception {
        LastCard last = new LastCard("create_issue", "{\"project\":\"SOLO\",\"title\":\"Test\"}");

        AssistantAnswer answer = ask("c'est pas le bon projet, c'est dans WEB", SOLO, SOLO, last);

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("pending");
            assertThat(inputOf(call).path("project").asText()).isEqualTo("WEB");
            assertThat(inputOf(call).path("title").asText()).isEqualTo("Test");
        });
        assertThat(answer.answer()).contains("Website");
        verify(conversations).setProject(1L, 7L, 1L, WEB);
        verify(llm, never()).rawChat(anyList(), anyList(), anyString());
    }

    @Test
    @DisplayName("la réponse sur la carte prépare la carte, et la conversation y travaille désormais")
    void theAnswerPreparesTheCardAndTheConversationAdoptsTheProject() throws Exception {
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        JsonNode asked = json.readTree("""
            {"arguments":"{\\"title\\":\\"Test\\"}","conversation":1,"screen":{},
             "questions":[{"field":"project","header":"Project","text":"Which project?","multiple":false,
               "choices":[{"value":"WEB","label":"Website","description":"WEB","recommended":false}]}]}""");
        when(records.question(RECORD, "create_issue", "q")).thenReturn(Optional.of(asked));
        when(records.answer(eq(RECORD), eq("create_issue"), eq("q"), eq(7L), any())).thenReturn(Optional.of(asked));

        AssistantToolCall next = service.answer("acme", 7L, "create_issue", RECORD.toString(), "q",
            List.of(new Question.Answer("project", List.of("WEB"), null)));

        assertThat(next.status()).isEqualTo("pending");
        assertThat(inputOf(next).path("project").asText()).isEqualTo("WEB");
        assertThat(inputOf(next).has(Question.ANSWERED)).isFalse();
        verify(conversations).setProject(1L, 7L, 1L, WEB);
    }

    @Test
    @DisplayName("une carte sans conversation retrouvée ne change rien d'autre que sa carte")
    void anAnswerWithoutAConversationAdoptsNothing() throws Exception {
        when(records.owns(eq(RECORD), any())).thenReturn(true);
        JsonNode asked = json.readTree("""
            {"arguments":"{\\"title\\":\\"Test\\"}","screen":{},
             "questions":[{"field":"project","header":"Project","text":"Which project?","multiple":false,"choices":[]}]}""");
        when(records.question(RECORD, "create_issue", "q")).thenReturn(Optional.of(asked));
        when(records.answer(eq(RECORD), eq("create_issue"), eq("q"), eq(7L), any())).thenReturn(Optional.of(asked));

        AssistantToolCall next = service.answer("acme", 7L, "create_issue", RECORD.toString(), "q",
            List.of(new Question.Answer("project", List.of(), "Website")));

        assertThat(next.status()).isEqualTo("pending");
        verify(conversations, never()).setProject(any(), any(), any(), any());
    }

    @Test
    @DisplayName("une correction sans autre projet à proposer laisse le tour se faire")
    void aCorrectionWithNothingElseToOffer() throws Exception {
        lenient().when(projectService.listProjects("acme", 7L)).thenReturn(List.of(project(SOLO, "SOLO", "Solo Initiatives")));
        when(llm.rawChat(anyList(), anyList(), anyString())).thenReturn(json.readTree("{\"content\":\"Il n'y a qu'un projet.\"}"));

        AssistantAnswer answer = ask("mauvais projet", SOLO, SOLO, new LastCard("create_issue", "{\"title\":\"Test\"}"));

        assertThat(answer.answer()).isEqualTo("Il n'y a qu'un projet.");
    }

    @Test
    @DisplayName("la question du projet garde ce qu'il faut à sa réponse : ses arguments, et la conversation")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void theQuestionKeepsItsConversation() throws Exception {
        modelCallsCreateIssue("{\"title\":\"Test\"}");

        ask("Crée une issue Test", null, null, null);

        org.mockito.ArgumentCaptor<Map<String, Object>> kept = (org.mockito.ArgumentCaptor) org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(records, org.mockito.Mockito.atLeastOnce()).append(eq(RECORD), eq("action.result"), any(), kept.capture());
        assertThat(kept.getValue()).containsEntry("conversation", 1L).containsEntry("status", AgentService.QUESTION);
    }

    @Test
    @DisplayName("un projet joint à la demande est celui du geste, si la phrase n'en nomme pas un autre")
    void aJoinedProjectIsTheProjectOfTheGesture() throws Exception {
        modelCallsCreateIssue("{\"title\":\"Test\"}");

        AssistantAnswer answer = service.run("acme", 7L, new TurnInput("Crée une issue Test", TurnHistory.of(List.of()), Screen.NONE,
            List.of(new Screen(WEB, null)), List.of(), 1L, SOLO, null));

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> {
            assertThat(call.status()).isEqualTo("pending");
            assertThat(inputOf(call).path("project").asText()).isEqualTo("WEB");
        });
    }

    @Test
    @DisplayName("deux projets joints ne décident pas : celui de la conversation")
    void twoJoinedProjectsDecideNothing() throws Exception {
        modelCallsCreateIssue("{\"title\":\"Test\"}");

        AssistantAnswer answer = service.run("acme", 7L, new TurnInput("Crée une issue Test", TurnHistory.of(List.of()), Screen.NONE,
            List.of(new Screen(WEB, null), new Screen(8L, null)), List.of(), 1L, SOLO, null));

        assertThat(answer.toolCalls()).singleElement()
            .satisfies(call -> assertThat(inputOf(call).path("project").asText()).isEqualTo("SOLO"));
    }

    @Test
    @DisplayName("une carte illisible ne casse rien : la question part sur des arguments vides")
    void anUnreadableCardStillAsks() {
        AssistantAnswer answer = ask("mauvais projet", SOLO, SOLO, new LastCard("create_issue", "not json"));

        assertThat(answer.toolCalls()).singleElement().satisfies(call -> assertThat(call.status()).isEqualTo(AgentService.QUESTION));
    }
}
