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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
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

    private McpServerService service;

    @BeforeEach
    void setUp() {
        TaskforceMcpTools tools = new TaskforceMcpTools(mapper, projectService, issueService, smartAssignService,
            brainSearchService, analyticsService, agentService);
        service = new McpServerService(tools, mapper, userRepository, identityResolver);
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

        assertThat(tools).hasSize(12);
        for (JsonNode tool : tools) {
            assertThat(tool.path("inputSchema").path("type").asText()).isEqualTo("object");
            assertThat(tool.path("description").asText()).isNotBlank();
        }
        assertThat(tools.findValuesAsText("name")).contains("get_issue", "add_comment", "brain_search", "ask_cortex");
    }

    @Test
    void tools_list_of_a_delegated_session_hides_what_it_can_never_use() {
        JsonNode tools = call(delegated(12L), "tools/list", Map.of()).path("result").path("tools");

        assertThat(tools.findValuesAsText("name")).doesNotContain("ask_cortex").contains("get_issue", "add_comment");
    }

    // ------------------------------------------------------------------ outils

    @Test
    void get_issue_returns_the_issue_and_its_thread() {
        when(issueService.getIssue("acme", 12L, 5L, 7L)).thenReturn(IssueResponse.builder().id(5L).title("Fix the footer").build());
        when(issueService.listComments("acme", 12L, 5L, 7L)).thenReturn(List.of());

        JsonNode result = callTool(user(), "get_issue", Map.of("projectId", 12, "issueId", 5));

        assertThat(result.path("isError").asBoolean()).isFalse();
        assertThat(result.path("structuredContent").path("commentCount").asInt()).isZero();
        assertThat(result.path("structuredContent").path("issue").path("title").asText()).isEqualTo("Fix the footer");
        assertThat(result.path("content").get(0).path("text").asText()).contains("\"commentCount\":0");
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
        "update_issue | {\"projectId\": 12, \"issueId\": 5}                  | Nothing to update",
        "list_issues  | {\"projectId\": 12, \"limit\": 500}                  | limit must be between 1 and 200",
        "get_issue    | {}                                                    | Missing argument: projectId",
    })
    void invalid_arguments_are_tool_errors_the_model_can_fix(String tool, String arguments, String message) throws Exception {
        JsonNode result = callTool(user(), tool, mapper.readValue(arguments, Map.class));

        assertThat(result.path("isError").asBoolean()).isTrue();
        assertThat(result.path("content").get(0).path("text").asText()).contains(message);
        verifyNoInteractions(issueService);
    }

    @Test
    void a_refusal_of_the_service_is_a_tool_error() {
        when(issueService.addComment(eq("acme"), eq(12L), eq(5L), any(CreateIssueCommentRequest.class), eq(7L)))
            .thenThrow(new ForbiddenException("you can't write to this project"));

        JsonNode result = callTool(user(), "add_comment", Map.of("projectId", 12, "issueId", 5, "content", "Done"));

        assertThat(result.path("isError").asBoolean()).isTrue();
        assertThat(result.path("content").get(0).path("text").asText()).startsWith("Access denied: you can't write");
    }

    @Test
    void unknown_tool_is_a_json_rpc_error() {
        JsonNode response = call(user(), "tools/call", Map.of("name", "delete_everything", "arguments", Map.of()));

        assertThat(response.path("error").path("code").asInt()).isEqualTo(McpServerService.INVALID_PARAMS);
    }

    // ------------------------------------------------------------------ session déléguée

    @Test
    void delegated_session_writes_to_its_own_project() {
        JsonNode result = callTool(delegated(12L), "add_comment", Map.of("projectId", 12, "issueId", 5, "content", "Done"));

        assertThat(result.path("isError").asBoolean()).isFalse();
        verify(issueService).addComment(eq("acme"), eq(12L), eq(5L), any(CreateIssueCommentRequest.class), eq(7L));
    }

    @ParameterizedTest(name = "refusé en session déléguée : {0} {1}")
    @CsvSource(delimiter = '|', value = {
        "update_issue | {\"projectId\": 99, \"issueId\": 5, \"title\": \"x\"}",
        "add_comment  | {\"projectId\": 99, \"issueId\": 5, \"content\": \"x\"}",
        "create_issue | {\"projectId\": 99, \"title\": \"x\"}",
        "ask_cortex   | {\"message\": \"what changed?\"}",
    })
    void delegated_session_cannot_reach_beyond_its_scope(String tool, String arguments) throws Exception {
        JsonNode result = callTool(delegated(12L), tool, mapper.readValue(arguments, Map.class));

        assertThat(result.path("isError").asBoolean()).isTrue();
        assertThat(result.path("content").get(0).path("text").asText()).contains("outside the delegation session");
        verify(issueService, never()).updateIssue(anyString(), anyLong(), anyLong(), any(UpdateIssueRequest.class), anyLong());
        verifyNoInteractions(agentService);
    }

    @Test
    void delegated_session_of_another_workspace_is_refused() {
        JsonNode result = callTool(delegated(12L), "get_issue", Map.of("projectId", 12, "issueId", 5), "other");

        assertThat(result.path("isError").asBoolean()).isTrue();
        verifyNoInteractions(issueService);
    }

    @Test
    void delegated_session_reads_other_projects_of_its_workspace() {
        when(issueService.listIssues("acme", 99L, 7L)).thenReturn(List.of());

        JsonNode result = callTool(delegated(12L), "list_issues", Map.of("projectId", 99));

        assertThat(result.path("isError").asBoolean()).isFalse();
    }

    @Test
    void personal_token_calls_act_as_the_person() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of());

        JsonNode result = callTool(personalToken(), "list_projects", Map.of());

        assertThat(result.path("structuredContent").path("total").asInt()).isZero();
    }

    // ------------------------------------------------------------------ outillage

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

    private static Jwt delegated(Long projectId) {
        return base()
            .claim(DeliverySessionFilter.RUN_CLAIM, 100L)
            .claim(DeliverySessionFilter.WORKSPACE_CLAIM, "acme")
            .claim(DeliverySessionFilter.PROJECT_CLAIM, projectId)
            .build();
    }
}
