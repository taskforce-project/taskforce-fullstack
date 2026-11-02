package com.taskforce.tf_api.core.service.mcpserver;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.response.ChecklistItemResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.security.DeliverySessionFilter;
import com.taskforce.tf_api.core.security.PersonalTokenAuthenticator;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.SmartAssignService;
import com.taskforce.tf_api.core.service.agent.AgentService;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Serveur MCP de l'instance (OSS-5.2) : protocole JSON-RPC, outils branchés sur les services de l'API, et portée
 * d'une session déléguée rejugée outil par outil.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpServerService")
class McpServerServiceTest {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @Mock private ProjectService projectService;
    @Mock private IssueService issueService;
    @Mock private SmartAssignService smartAssignService;
    @Mock private BrainSearchService brainSearchService;
    @Mock private AnalyticsService analyticsService;
    @Mock private AgentService agentService;
    @Mock private UserRepository userRepository;
    @Mock private JwtIdentityResolver identityResolver;
    @Mock private IssueGestures gestures;

    private McpServerService service;

    @BeforeEach
    void setUp() {
        TaskforceMcpTools tools = new TaskforceMcpTools(mapper, projectService, issueService, smartAssignService,
            brainSearchService, analyticsService, agentService, gestures);
        service = new McpServerService(tools, mapper, userRepository, identityResolver);
        // Sans clé d'issue, les arguments passent tels quels ; les gestes répondent par leur phrase.
        lenient().when(gestures.withIds(any(), any(), any())).thenAnswer(inv -> inv.getArgument(2));
        lenient().when(gestures.update(any(), any(), any())).thenReturn(gesture("Updated"));
        lenient().when(gestures.comment(any(), any(), any())).thenReturn(gesture("Commented"));
        lenient().when(identityResolver.resolveEmail(any())).thenAnswer(inv -> ((Jwt) inv.getArgument(0)).getClaimAsString("email"));
        lenient().when(userRepository.findByEmail("ada@taskforce.dev"))
            .thenReturn(Optional.of(User.builder().id(7L).email("ada@taskforce.dev").build()));
    }

    // ------------------------------------------------------------------ protocole

    @ParameterizedTest(name = "version demandée [{0}] -> [{1}]")
    @CsvSource({"2025-06-18, 2025-06-18", "2025-03-26, 2025-03-26", "2025-11-25, 2025-11-25", "2099-01-01, 2025-11-25", "'', 2025-11-25"})
    void initialize_negotiates_the_protocol_version(String requested, String expected) {
        JsonNode result = call(user(), "initialize", Map.of("protocolVersion", requested)).get("result");

        assertThat(result.path("protocolVersion").asText()).isEqualTo(expected);
        assertThat(result.path("capabilities").has("tools")).isTrue();
        assertThat(result.path("serverInfo").path("name").asText()).isEqualTo("taskforce");
    }

    @ParameterizedTest(name = "corps brut [{0}] -> HTTP {1}, code {2}")
    @CsvSource(delimiter = '|', value = {
        "not json                                              | 400 | -32700",
        "[{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}]  | 400 | -32600",
        "''                                                    | 400 | -32600",
        "{\"id\":1,\"method\":\"ping\"}                        | 200 | -32600",
    })
    void raw_bodies_that_are_not_one_message_are_protocol_errors(String body, int status, int code) throws Exception {
        McpServerService.Reply reply = service.reply("acme", user(), body);

        assertThat(reply.status()).isEqualTo(status);
        assertThat(mapper.readTree(reply.json()).path("error").path("code").asInt()).isEqualTo(code);
    }

    @Test
    void raw_body_of_a_request_is_answered_in_json() throws Exception {
        McpServerService.Reply reply = service.reply("acme", user(), "{\"jsonrpc\":\"2.0\",\"id\":\"a1\",\"method\":\"ping\"}");

        assertThat(reply.status()).isEqualTo(200);
        JsonNode json = mapper.readTree(reply.json());
        assertThat(json.path("id").asText()).isEqualTo("a1");
        assertThat(json.path("result").isObject()).isTrue();
    }

    @Test
    void raw_body_of_a_notification_is_accepted_without_body() {
        McpServerService.Reply reply = service.reply("acme", user(), "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");

        assertThat(reply).isEqualTo(new McpServerService.Reply(202, null));
    }

    @Test
    void notifications_get_no_response() {
        ObjectNode message = mapper.createObjectNode().put("jsonrpc", "2.0").put("method", "notifications/initialized");

        assertThat(service.handle("acme", user(), message)).isEmpty();
    }

    @Test
    void unknown_method_is_a_json_rpc_error() {
        JsonNode response = call(user(), "resources/list", Map.of());

        assertThat(response.path("error").path("code").asInt()).isEqualTo(McpServerService.METHOD_NOT_FOUND);
        assertThat(response.path("id").asInt()).isEqualTo(1);
    }

    @Test
    void a_message_without_jsonrpc_is_invalid() {
        ObjectNode message = mapper.createObjectNode().put("id", 1).put("method", "ping");

        JsonNode response = service.handle("acme", user(), message).orElseThrow();

        assertThat(response.path("error").path("code").asInt()).isEqualTo(McpServerService.INVALID_REQUEST);
    }

    @Test
    void tools_list_describes_every_tool() {
        JsonNode tools = call(user(), "tools/list", Map.of()).path("result").path("tools");

        assertThat(tools).hasSize(15);
        for (JsonNode tool : tools) {
            assertThat(tool.path("inputSchema").path("type").asText()).isEqualTo("object");
            assertThat(tool.path("description").asText()).isNotBlank();
        }
        assertThat(tools.findValuesAsText("name"))
            .contains("get_issue", "add_comment", "brain_search", "ask_cortex", "check_checklist_item", "update_issue",
                "delegate_issue", "get_mission");
    }

    @Test
    void tools_list_of_a_delegated_session_hides_what_it_can_never_use() {
        JsonNode tools = call(delegated(), "tools/list", Map.of()).path("result").path("tools");

        // Les outils qui écrivent restent proposés : ils servent sur l'issue du run, ou pour créer une issue.
        assertThat(tools.findValuesAsText("name")).doesNotContain("ask_cortex")
            .contains("get_issue", "add_comment", "check_checklist_item", "update_issue", "create_issue");
        // Confier une issue, lire une mission : jamais depuis la session d'une autre mission.
        assertThat(tools.findValuesAsText("name")).doesNotContain("delegate_issue", "get_mission");
    }

    @Test
    void initialize_asks_to_check_the_checklist_items_the_agent_completes() {
        JsonNode result = call(user(), "initialize", Map.of("protocolVersion", "2025-06-18")).path("result");

        assertThat(result.path("instructions").asText()).contains("check_checklist_item");
    }

    // ------------------------------------------------------------------ outils

    @Test
    void get_issue_returns_the_issue_its_checklist_and_its_thread() {
        when(issueService.getIssue("acme", 12L, 5L, 7L)).thenReturn(IssueResponse.builder().id(5L).title("Fix the footer").build());
        when(issueService.listChecklist("acme", 12L, 5L, 7L)).thenReturn(List.of(
            ChecklistItemResponse.builder().id(31L).content("Update the README").done(false).position(0).build()));
        when(issueService.listComments("acme", 12L, 5L, 7L)).thenReturn(List.of());

        JsonNode result = callTool(user(), "get_issue", Map.of("projectId", 12, "issueId", 5));

        assertThat(result.path("isError").asBoolean()).isFalse();
        assertThat(result.path("structuredContent").path("commentCount").asInt()).isZero();
        assertThat(result.path("structuredContent").path("issue").path("title").asText()).isEqualTo("Fix the footer");
        // Les lignes de la checklist avec leur id : l'agent coche celle qu'il a faite (check_checklist_item).
        JsonNode item = result.path("structuredContent").path("checklist").get(0);
        assertThat(item.path("id").asLong()).isEqualTo(31L);
        assertThat(item.path("content").asText()).isEqualTo("Update the README");
        assertThat(item.path("done").asBoolean()).isFalse();
        assertThat(result.path("content").get(0).path("text").asText()).contains("\"commentCount\":0");
    }

    @ParameterizedTest(name = "done={0}")
    @ValueSource(booleans = {true, false})
    void check_checklist_item_checks_or_unchecks_by_id(boolean done) {
        when(issueService.updateChecklistItem(eq("acme"), eq(12L), eq(5L), eq(31L), eq(7L), any(UpdateChecklistItemRequest.class)))
            .thenReturn(ChecklistItemResponse.builder().id(31L).content("Update the README").done(done).build());

        JsonNode result = callTool(delegated(), "check_checklist_item",
            Map.of("projectId", 12, "issueId", 5, "itemId", 31, "done", done));

        assertThat(result.path("isError").asBoolean()).isFalse();
        assertThat(result.path("structuredContent").path("done").asBoolean()).isEqualTo(done);
        ArgumentCaptor<UpdateChecklistItemRequest> request = ArgumentCaptor.forClass(UpdateChecklistItemRequest.class);
        verify(issueService).updateChecklistItem(eq("acme"), eq(12L), eq(5L), eq(31L), eq(7L), request.capture());
        assertThat(request.getValue().getDone()).isEqualTo(done);
        assertThat(request.getValue().getContent()).isNull(); // l'agent coche, il ne réécrit pas la ligne
    }

    @Test
    void list_issues_is_capped_with_the_total() {
        when(issueService.listIssues("acme", 12L, 7L)).thenReturn(java.util.Collections.nCopies(80, null));

        JsonNode result = callTool(user(), "list_issues", Map.of("projectId", 12, "limit", 30)).path("structuredContent");

        assertThat(result.path("total").asInt()).isEqualTo(80);
        assertThat(result.path("returned").asInt()).isEqualTo(30);
    }

    @Test
    void create_issue_maps_the_arguments() {
        callTool(user(), "create_issue", Map.of("projectId", 12, "title", "Fix the footer", "priority", "high",
            "dueDate", "2026-11-02"));

        ArgumentCaptor<CreateIssueRequest> request = ArgumentCaptor.forClass(CreateIssueRequest.class);
        verify(issueService).createIssue(eq("acme"), eq(12L), request.capture(), eq(7L));
        assertThat(request.getValue().getTitle()).isEqualTo("Fix the footer");
        assertThat(request.getValue().getPriority()).isEqualTo(IssuePriority.HIGH);
        assertThat(request.getValue().getDueDate()).isEqualTo("2026-11-02");
    }

    @ParameterizedTest(name = "argument invalide : {0}")
    @CsvSource(delimiter = '|', value = {
        "create_issue | {\"projectId\": 12}                                  | Missing argument: title",
        "create_issue | {\"projectId\": \"12\", \"title\": \"x\"}            | projectId must be an integer",
        "create_issue | {\"projectId\": 12, \"title\": \"x\", \"priority\": \"soon\"} | priority has an unknown value",
        "create_issue | {\"projectId\": 12, \"title\": \"x\", \"dueDate\": \"2 nov\"} | dueDate must be a date",
        "list_issues  | {\"projectId\": 12, \"limit\": 500}                  | limit must be between 1 and 200",
        "get_issue    | {}                                                    | Missing argument: projectId",
        "check_checklist_item | {\"projectId\": 12, \"issueId\": 5, \"itemId\": 31} | Missing argument: done",
        "check_checklist_item | {\"projectId\": 12, \"issueId\": 5, \"itemId\": 31, \"done\": \"yes\"} | done must be true or false",
        "check_checklist_item | {\"projectId\": 12, \"issueId\": 5, \"done\": true} | Missing argument: itemId",
    })
    void invalid_arguments_are_tool_errors_the_model_can_fix(String tool, String arguments, String message) throws Exception {
        JsonNode result = callTool(user(), tool, mapper.readValue(arguments, Map.class));

        assertThat(result.path("isError").asBoolean()).isTrue();
        assertThat(result.path("content").get(0).path("text").asText()).contains(message);
        verifyNoInteractions(issueService);
    }

    @Test
    void a_refusal_of_the_service_is_a_tool_error() {
        when(gestures.comment(eq("acme"), eq(7L), any())).thenThrow(new ForbiddenException("you can't write to this project"));

        JsonNode result = callTool(user(), "add_comment", Map.of("projectId", 12, "issueId", 5, "content", "Done"));

        assertThat(result.path("isError").asBoolean()).isTrue();
        assertThat(result.path("content").get(0).path("text").asText()).startsWith("Access denied: you can't write");
    }

    @Test
    @DisplayName("un geste rend sa phrase, l'issue et ses changements, jamais de quoi le défaire")
    void a_gesture_answers_without_what_undoes_it() {
        when(gestures.update(eq("acme"), eq(7L), any())).thenReturn(new IssueGestures.Gesture("Updated TF-12",
            Map.of("issueId", 5, "key", "TF-12"), List.of(new IssueGestures.Change("column", "Todo", "Done")), Map.of(),
            Map.of("fields", Map.of("status", Map.of("from", 2, "to", 3)))));

        JsonNode result = callTool(user(), "update_issue", Map.of("issue", "TF-12", "status", "Done"));

        assertThat(result.path("isError").asBoolean()).isFalse();
        JsonNode content = result.path("structuredContent");
        assertThat(content.path("summary").asText()).isEqualTo("Updated TF-12");
        assertThat(content.path("changes").get(0).path("to").asText()).isEqualTo("Done");
        assertThat(content.has("undo")).isFalse();
    }

    @Test
    void unknown_tool_is_a_json_rpc_error() {
        JsonNode response = call(user(), "tools/call", Map.of("name", "delete_everything", "arguments", Map.of()));

        assertThat(response.path("error").path("code").asInt()).isEqualTo(McpServerService.INVALID_PARAMS);
    }

    // ------------------------------------------------------------------ session déléguée

    /** R110 (séance n°16) : la session du run 100 (projet 12, issue 5) change son issue et crée dans son projet. */
    @ParameterizedTest(name = "admis en session déléguée : {0} {1}")
    @CsvSource(delimiter = '|', value = {
        "update_issue         | {\"projectId\": 12, \"issueId\": 5, \"statusId\": 3}                  | update",
        "add_comment          | {\"projectId\": 12, \"issueId\": 5, \"content\": \"Done\"}            | comment",
        "check_checklist_item | {\"projectId\": 12, \"issueId\": 5, \"itemId\": 31, \"done\": true} | updateChecklistItem",
        "create_issue         | {\"projectId\": 12, \"title\": \"Follow-up\"}                         | createIssue",
    })
    void delegated_session_changes_its_issue_and_creates_in_its_project(String tool, String arguments,
                                                                        String serviceMethod) throws Exception {
        JsonNode result = callTool(delegated(), tool, mapper.readValue(arguments, Map.class));

        assertThat(result.path("isError").asBoolean()).isFalse();
        assertThat(java.util.stream.Stream.concat(mockingDetails(issueService).getInvocations().stream(),
                mockingDetails(gestures).getInvocations().stream())
            .map(invocation -> invocation.getMethod().getName())
            .filter(name -> !"withIds".equals(name)))
            .containsExactly(serviceMethod);
    }

    /**
     * L'agent d'une mission nomme son issue par sa clé : la clé devient ses ids avant que la portée juge, et une autre
     * issue reste hors d'atteinte.
     */
    @ParameterizedTest(name = "{0} est l'issue {1} : admis {2}")
    @CsvSource({"TF-5, 5, true", "TF-6, 6, false"})
    void a_delegated_agent_names_its_issue_by_its_key(String key, long issueId, boolean allowed) {
        when(gestures.withIds(eq("acme"), eq(7L), any())).thenAnswer(inv -> {
            ObjectNode args = ((JsonNode) inv.getArgument(2)).deepCopy();
            return args.put("projectId", 12).put("issueId", issueId);
        });

        JsonNode result = callTool(delegated(), "update_issue", Map.of("issue", key, "status", "Done"));

        assertThat(result.path("isError").asBoolean()).isEqualTo(!allowed);
        if (allowed) {
            ArgumentCaptor<JsonNode> args = ArgumentCaptor.forClass(JsonNode.class);
            verify(gestures).update(eq("acme"), eq(7L), args.capture());
            assertThat(args.getValue().path("issueId").asLong()).isEqualTo(issueId);
        } else {
            verify(gestures, org.mockito.Mockito.never()).update(any(), any(), any());
        }
    }

    @ParameterizedTest(name = "refusé en session déléguée : {0} {1}")
    @CsvSource(delimiter = '|', value = {
        // Une autre issue du même projet : ni ses champs, ni un commentaire, ni sa checklist (R110)
        "update_issue | {\"projectId\": 12, \"issueId\": 6, \"title\": \"x\"}",
        "add_comment  | {\"projectId\": 12, \"issueId\": 6, \"content\": \"x\"}",
        "check_checklist_item | {\"projectId\": 12, \"issueId\": 6, \"itemId\": 31, \"done\": true}",
        "smart_assign | {\"projectId\": 12, \"issueId\": 6}",
        // Un autre projet
        "update_issue | {\"projectId\": 99, \"issueId\": 5, \"title\": \"x\"}",
        "add_comment  | {\"projectId\": 99, \"issueId\": 5, \"content\": \"x\"}",
        "create_issue | {\"projectId\": 99, \"title\": \"x\"}",
        "check_checklist_item | {\"projectId\": 99, \"issueId\": 5, \"itemId\": 31, \"done\": true}",
        // Le niveau du workspace
        "ask_cortex   | {\"message\": \"what changed?\"}",
    })
    void delegated_session_cannot_reach_beyond_its_scope(String tool, String arguments) throws Exception {
        JsonNode result = callTool(delegated(), tool, mapper.readValue(arguments, Map.class));

        assertThat(result.path("isError").asBoolean()).isTrue();
        // Le refus dit à l'agent ce que la tâche lui permet, et l'issue qui est la sienne.
        assertThat(result.path("content").get(0).path("text").asText())
            .contains("outside the delegation session").contains("issueId 5").contains("Do not retry");
        verifyNoInteractions(issueService, smartAssignService, agentService);
        verify(gestures, org.mockito.Mockito.never()).update(any(), any(), any());
        verify(gestures, org.mockito.Mockito.never()).comment(any(), any(), any());
    }

    @Test
    void delegated_session_of_another_workspace_is_refused() {
        JsonNode result = callTool(delegated(), "get_issue", Map.of("projectId", 12, "issueId", 5), "other");

        assertThat(result.path("isError").asBoolean()).isTrue();
        verifyNoInteractions(issueService);
    }

    /** Les lectures ne changent pas : tout le workspace du run, toutes ses issues. */
    @ParameterizedTest(name = "lecture en session déléguée : {0} {1}")
    @CsvSource(delimiter = '|', value = {
        "list_issues | {\"projectId\": 99}",
        "get_issue   | {\"projectId\": 12, \"issueId\": 6}",
        "get_issue   | {\"projectId\": 99, \"issueId\": 7}",
    })
    void delegated_session_reads_the_whole_workspace(String tool, String arguments) throws Exception {
        JsonNode result = callTool(delegated(), tool, mapper.readValue(arguments, Map.class));

        assertThat(result.path("isError").asBoolean()).isFalse();
    }

    @ParameterizedTest(name = "session déléguée sans son issue : {0} refusé")
    @CsvSource(delimiter = '|', value = {
        "get_issue    | {\"projectId\": 12, \"issueId\": 5}",
        "add_comment  | {\"projectId\": 12, \"issueId\": 5, \"content\": \"x\"}",
        "create_issue | {\"projectId\": 12, \"title\": \"x\"}",
    })
    void delegated_session_without_its_issue_reaches_nothing(String tool, String arguments) throws Exception {
        Jwt incomplete = base()
            .claim(DeliverySessionFilter.RUN_CLAIM, 100L)
            .claim(DeliverySessionFilter.WORKSPACE_CLAIM, "acme")
            .claim(DeliverySessionFilter.PROJECT_CLAIM, 12L)
            .build();

        JsonNode result = callTool(incomplete, tool, mapper.readValue(arguments, Map.class));

        assertThat(result.path("isError").asBoolean()).isTrue();
        verifyNoInteractions(issueService);
    }

    @Test
    void personal_token_calls_act_as_the_person() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of());

        JsonNode result = callTool(personalToken(), "list_projects", Map.of());

        assertThat(result.path("structuredContent").path("total").asInt()).isZero();
    }

    // ------------------------------------------------------------------ outillage

    private static IssueGestures.Gesture gesture(String summary) {
        return new IssueGestures.Gesture(summary, Map.of("issueId", 5), List.of(), Map.of(), null);
    }

    private JsonNode callTool(Jwt principal, String tool, Map<?, ?> arguments) {
        return callTool(principal, tool, arguments, "acme");
    }

    private JsonNode callTool(Jwt principal, String tool, Map<?, ?> arguments, String slug) {
        ObjectNode message = mapper.createObjectNode().put("jsonrpc", "2.0").put("id", 1).put("method", "tools/call");
        message.putObject("params").put("name", tool).set("arguments", mapper.valueToTree(arguments));
        return service.handle(slug, principal, message).orElseThrow().path("result");
    }

    private JsonNode call(Jwt principal, String method, Map<String, ?> params) {
        ObjectNode message = mapper.createObjectNode().put("jsonrpc", "2.0").put("id", 1).put("method", method);
        message.set("params", mapper.valueToTree(params));
        return service.handle("acme", principal, message).orElseThrow();
    }

    private static Jwt.Builder base() {
        return Jwt.withTokenValue("t").header("alg", "none").claim("email", "ada@taskforce.dev")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
    }

    private static Jwt user() {
        return base().build();
    }

    private static Jwt personalToken() {
        return base().claim(PersonalTokenAuthenticator.TOKEN_CLAIM, 3L).build();
    }

    /** Principal délégué, tel que le pose {@code DeliverySessionFilter} : run 100, projet 12, issue 5. */
    private static Jwt delegated() {
        return base()
            .claim(DeliverySessionFilter.RUN_CLAIM, 100L)
            .claim(DeliverySessionFilter.WORKSPACE_CLAIM, "acme")
            .claim(DeliverySessionFilter.PROJECT_CLAIM, 12L)
            .claim(DeliverySessionFilter.ISSUE_CLAIM, 5L)
            .build();
    }
}
