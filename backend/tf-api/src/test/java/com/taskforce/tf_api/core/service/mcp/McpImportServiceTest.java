package com.taskforce.tf_api.core.service.mcp;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.ToolClass;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.CortexGate;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires - {@link McpImportService} (TF-MCP-04 : import d'un projet externe via MCP ; séance n°22 R158 : comme
 * tout geste, par la connexion de la personne, jugé par les règles et gardé au dossier).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpImportService")
class McpImportServiceTest {

    private static final UUID RECORD = UUID.fromString("00000000-0000-0000-0000-0000000000bb");

    @Mock private WorkspaceMcpService workspaceMcp;
    @Mock private ProjectService projectService;
    @Mock private IssueService issueService;
    @Mock private LlmClient llm;
    @Mock private com.taskforce.tf_api.core.service.AiUsageService aiUsageService;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private WorkspaceRepository workspaces;
    @Mock private CortexRecordService records;
    @Mock private McpClient mcp;

    private McpImportService service;
    private final ObjectMapper json = new ObjectMapper();
    private final Workspace ws = Workspace.builder().id(10L).slug("acme")
        .owner(User.builder().email("owner@acme.test").build()).build();

    @BeforeEach
    void setup() {
        lenient().when(workspaces.findById(10L)).thenReturn(Optional.of(ws));
        lenient().when(records.open(any(), any(), any())).thenReturn(RECORD);
        lenient().when(records.append(any(), any(), any(), any())).thenReturn(Optional.of("hash"));
        service = new McpImportService(workspaceMcp, projectService, issueService, llm, json,
            new com.taskforce.tf_api.core.service.AiMeter(aiUsageService, llm),
            new CortexGate(new HarnessRulesService(ruleSets), workspaces), records);
    }

    private ExternalMcpTool listTool(ToolClass cls) throws Exception {
        return new ExternalMcpTool(mcp, new McpClient.ServerRef("linear", "http://x/mcp", "AT"),
            new McpClient.ToolDef("list_issues", "Lists issues", json.readTree("{\"type\":\"object\"}"), false),
            json, cls, ConnectionScope.PERSONAL);
    }

    private void connectorWithTools(String... tools) {
        when(workspaceMcp.serverStatuses(10L, 7L)).thenReturn(List.of(
            new WorkspaceMcpService.McpServerStatus("linear", null, "mcp.linear.app", ConnectionScope.PERSONAL,
                ConnectionState.CONNECTED, "ada@acme.test", true, List.of(tools), List.of(), null)));
    }

    private void readReturns(ExternalMcpTool tool, String raw) {
        McpClient.Session session = new McpClient.Session("http://x/mcp", null, "AT");
        when(mcp.initialize(any())).thenReturn(session);
        when(mcp.callTool(eq(session), eq("list_issues"), any())).thenReturn(raw);
        when(workspaceMcp.toolFor(10L, 7L, "linear__list_issues")).thenReturn(Optional.of(tool));
    }

    @Test
    @DisplayName("import : par la connexion de la personne, jugé, gardé au dossier ; normalise et crée le projet + les issues")
    void imports_project() throws Exception {
        connectorWithTools("list_issues", "save_issue");
        readReturns(listTool(ToolClass.READ), "<données brutes Linear>");
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(anyString(), anyString(), eq(true), any())).thenReturn(
            "{\"issues\":[{\"title\":\"Bug login\",\"description\":\"casse\",\"priority\":\"HIGH\"},{\"title\":\"Feature X\"}]}");
        when(projectService.createProject(eq("acme"), eq(7L), any()))
            .thenReturn(ProjectResponse.builder().id(99L).identifier("IMPORT").name("Import Linear").build());
        when(issueService.createIssue(eq("acme"), eq(99L), any(), eq(7L)))
            .thenReturn(IssueResponse.builder().id(1L).identifier("IMPORT-1").title("x").build());

        McpImportService.ImportResult r = service.importProject(ws, 7L, "linear", "Import Linear");

        assertThat(r.projectId()).isEqualTo(99L);
        assertThat(r.found()).isEqualTo(2);
        assertThat(r.imported()).isEqualTo(2);
        ArgumentCaptor<CreateIssueRequest> cap = ArgumentCaptor.forClass(CreateIssueRequest.class);
        verify(issueService, times(2)).createIssue(eq("acme"), eq(99L), cap.capture(), eq(7L));
        assertThat(cap.getAllValues().get(0).getTitle()).isEqualTo("Bug login");
        assertThat(cap.getAllValues().get(0).getPriority()).isEqualTo(IssuePriority.HIGH);
        // Trois gestes demandés puis décidés au dossier : la lecture, le projet, les issues.
        verify(records, times(3)).append(eq(RECORD), eq("action.requested"), any(), any());
        verify(records, times(3)).append(eq(RECORD), eq("action.decided"), any(), any());
        verify(records, never()).append(eq(RECORD), eq("human.decision"), any(), any());
    }

    @Test
    @DisplayName("import : un outil de liste dont TaskForce ne sait pas la classe -> demandé, accordé par le clic, au dossier")
    void an_unknown_list_tool_is_approved_by_the_click() throws Exception {
        connectorWithTools("list_issues");
        readReturns(listTool(ToolClass.WRITE), "[]");
        when(llm.isConfigured()).thenReturn(false);
        when(projectService.createProject(eq("acme"), eq(7L), any()))
            .thenReturn(ProjectResponse.builder().id(99L).identifier("X").name("X").build());

        service.importProject(ws, 7L, "linear", "X");

        verify(records).append(eq(RECORD), eq("human.decision"), eq(CortexRecordService.Actor.person(7L)), any());
    }

    @Test
    @DisplayName("import : les règles de l'espace refusent -> rien n'est lu, aucun projet, le refus est au dossier")
    void refused_by_the_rules() throws Exception {
        connectorWithTools("list_issues");
        ExternalMcpTool tool = listTool(ToolClass.READ);
        when(workspaceMcp.toolFor(10L, 7L, "linear__list_issues")).thenReturn(Optional.of(tool));
        CortexGate deny = Mockito.mock(CortexGate.class);
        when(deny.judge(any(), any(Map.class))).thenReturn(new CortexGate.Verdict("deny", "frozen", "Imports are frozen.", Map.of()));
        service = new McpImportService(workspaceMcp, projectService, issueService, llm, json,
            new com.taskforce.tf_api.core.service.AiMeter(aiUsageService, llm), deny, records);

        assertThatThrownBy(() -> service.importProject(ws, 7L, "linear", "X")).hasMessageContaining("Imports are frozen.");
        verify(mcp, never()).callTool(any(), any(), any());
        verify(projectService, never()).createProject(anyString(), anyLong(), any());
        verify(records).append(eq(RECORD), eq("action.result"), any(), any());
    }

    @Test
    @DisplayName("import : connecteur sans outil d'issues -> erreur claire, aucun projet créé")
    void fails_when_no_issues_tool() {
        connectorWithTools("save_document");

        assertThatThrownBy(() -> service.importProject(ws, 7L, "linear", "X"))
            .isInstanceOf(BusinessException.class);
        verify(projectService, never()).createProject(anyString(), anyLong(), any());
    }

    @Test
    @DisplayName("import : normalisation illisible -> projet créé mais vide (found=0)")
    void empty_when_unparseable() throws Exception {
        connectorWithTools("list_issues");
        readReturns(listTool(ToolClass.READ), "bla");
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(anyString(), anyString(), eq(true), any())).thenReturn("pas du json");
        when(projectService.createProject(eq("acme"), eq(7L), any()))
            .thenReturn(ProjectResponse.builder().id(99L).identifier("X").name("X").build());

        McpImportService.ImportResult r = service.importProject(ws, 7L, "linear", "X");

        assertThat(r.found()).isZero();
        assertThat(r.imported()).isZero();
        verify(issueService, never()).createIssue(anyString(), anyLong(), any(), anyLong());
    }
}
