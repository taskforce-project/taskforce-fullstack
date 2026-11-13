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
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.CortexGate;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.core.service.rules.RuleApprovers;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
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
    @Mock private com.taskforce.tf_api.core.repository.WorkspaceMemberRepository members;
    @Mock private com.taskforce.tf_api.core.repository.ProjectRepository projectRepository;
    @Mock private com.taskforce.tf_api.core.repository.IssueRepository issueRepository;
    @Mock private CortexRecordService records;
    @Mock private McpClient mcp;
    @Mock private com.taskforce.tf_api.core.repository.ProjectMemberRepository projectMembers;

    private McpImportService service;
    private final ObjectMapper json = new ObjectMapper();
    private final Workspace ws = Workspace.builder().id(10L).slug("acme")
        .owner(User.builder().email("owner@acme.test").build()).build();

    @BeforeEach
    void setup() {
        lenient().when(workspaces.findById(10L)).thenReturn(Optional.of(ws));
        lenient().when(records.open(any(), any(), any())).thenReturn(RECORD);
        lenient().when(records.append(any(), any(), any(), any())).thenReturn(Optional.of("hash"));
        // La personne qui importe (7) est propriétaire de l'espace : le service vérifie lui-même le rôle.
        lenient().when(members.findByWorkspaceIdAndUserId(10L, 7L)).thenReturn(Optional.of(
            WorkspaceMember.builder().workspace(ws).role(WorkspaceRole.OWNER).build()));
        service = new McpImportService(workspaceMcp, projectService, issueService, llm, json,
            new com.taskforce.tf_api.core.service.AiMeter(aiUsageService, llm),
            new CortexGate(new HarnessRulesService(ruleSets, members), workspaces, projectRepository, issueRepository, json), records,
            approvers(), new com.taskforce.tf_api.core.service.AuthorizationService(members));
    }

    @Test
    @DisplayName("import : un membre qui n'administre pas l'espace est refusé par le service, avant toute lecture ni projet")
    void a_member_cannot_import() {
        when(members.findByWorkspaceIdAndUserId(10L, 8L)).thenReturn(Optional.of(
            WorkspaceMember.builder().workspace(ws).role(WorkspaceRole.MEMBER).build()));

        assertThatThrownBy(() -> service.importProject(ws, 8L, "linear", "X")).isInstanceOf(ForbiddenException.class);
        verify(workspaceMcp, never()).toolFor(any(), any(), any());
        verify(workspaceMcp, never()).toolsFor(any());
        verify(records, never()).open(any(), any(), any());
        verify(projectService, never()).createProject(anyString(), anyLong(), any());
    }

    private RuleApprovers approvers() {
        return new RuleApprovers(members, projectMembers);
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
        when(issueService.createIssue(eq("acme"), eq(99L), any(), eq(7L), isNull(), eq("linear")))
            .thenReturn(IssueResponse.builder().id(1L).identifier("IMPORT-1").title("x").build());

        McpImportService.ImportResult r = service.importProject(ws, 7L, "linear", "Import Linear");

        assertThat(r.projectId()).isEqualTo(99L);
        assertThat(r.found()).isEqualTo(2);
        assertThat(r.imported()).isEqualTo(2);
        ArgumentCaptor<CreateIssueRequest> cap = ArgumentCaptor.forClass(CreateIssueRequest.class);
        // Chaque issue garde l'outil d'où elle vient : Cortex la lira comme un contenu du dehors (R158).
        verify(issueService, times(2)).createIssue(eq("acme"), eq(99L), cap.capture(), eq(7L), isNull(), eq("linear"));
        assertThat(cap.getAllValues().get(0).getTitle()).isEqualTo("Bug login");
        assertThat(cap.getAllValues().get(0).getPriority()).isEqualTo(IssuePriority.HIGH);
        // Trois gestes demandés puis décidés au dossier : la lecture, le projet, les issues.
        verify(records, times(3)).append(eq(RECORD), eq("action.requested"), any(), any());
        verify(records, times(3)).append(eq(RECORD), eq("action.decided"), any(), any());
        verify(records, never()).append(eq(RECORD), eq("human.decision"), any(), any());
    }

    @Test
    @DisplayName("import : seul un outil classé en lecture est choisi ; une écriture qui parle d'issues ne l'est jamais")
    void only_a_tool_classed_as_read_is_picked() throws Exception {
        connectorWithTools("delete_issue", "list_issues", "search_issues");
        ExternalMcpTool delete = new ExternalMcpTool(mcp, new McpClient.ServerRef("linear", "http://x/mcp", "AT"),
            new McpClient.ToolDef("delete_issue", "Deletes an issue", json.readTree("{\"type\":\"object\"}"), true),
            json, ToolClass.WRITE, ConnectionScope.PERSONAL);
        when(workspaceMcp.toolFor(10L, 7L, "linear__list_issues")).thenReturn(Optional.of(listTool(ToolClass.WRITE)));
        when(workspaceMcp.toolFor(10L, 7L, "linear__delete_issue")).thenReturn(Optional.of(delete));
        when(workspaceMcp.toolFor(10L, 7L, "linear__search_issues")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.importProject(ws, 7L, "linear", "X"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("only reads");
        verify(mcp, never()).callTool(any(), any(), any());
        verify(mcp, never()).initialize(any());
        verify(projectService, never()).createProject(anyString(), anyLong(), any());
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
            new com.taskforce.tf_api.core.service.AiMeter(aiUsageService, llm), deny, records, approvers(),
            new com.taskforce.tf_api.core.service.AuthorizationService(members));

        assertThatThrownBy(() -> service.importProject(ws, 7L, "linear", "X")).hasMessageContaining("Imports are frozen.");
        verify(mcp, never()).callTool(any(), any(), any());
        verify(projectService, never()).createProject(anyString(), anyLong(), any());
        verify(records).append(eq(RECORD), eq("action.result"), any(), any());
    }

    @Test
    @DisplayName("import : une règle qui désigne qui accorde vaut comme dans la console ; un administrateur seul n'y suffit pas")
    @SuppressWarnings("unchecked")
    void the_approvers_a_rule_designates_are_enforced() throws Exception {
        connectorWithTools("list_issues");
        ExternalMcpTool tool = listTool(ToolClass.READ);
        when(workspaceMcp.toolFor(10L, 7L, "linear__list_issues")).thenReturn(Optional.of(tool));
        CortexGate gate = Mockito.mock(CortexGate.class);
        when(gate.personFacts(any(), any())).thenReturn(Map.of("action", "mcp.read"));
        CortexGate.Verdict ownerOnly = new CortexGate.Verdict("ask", "ws-owner-projects", "Only the owner creates projects.",
            Map.of(), new RulesEngine.Obligations(List.of(List.of("role:owner")), 1, false));
        when(gate.judge(any(), any(Map.class))).thenAnswer(inv -> "project.create".equals(
            ((Map<String, String>) inv.getArgument(1)).get("action")) ? ownerOnly
            : new CortexGate.Verdict("allow", "read-company-tools", "Read.", Map.of()));
        // Un administrateur peut importer, mais la règle désigne le propriétaire.
        when(members.findByWorkspaceIdAndUserId(10L, 7L)).thenReturn(Optional.of(
            WorkspaceMember.builder().workspace(ws).role(WorkspaceRole.ADMIN).build()));
        service = new McpImportService(workspaceMcp, projectService, issueService, llm, json,
            new com.taskforce.tf_api.core.service.AiMeter(aiUsageService, llm), gate, records, approvers(),
            new com.taskforce.tf_api.core.service.AuthorizationService(members));

        assertThatThrownBy(() -> service.importProject(ws, 7L, "linear", "X"))
            .isInstanceOf(ForbiddenException.class)
            .hasMessageContaining("the workspace's owner").hasMessageContaining("Only the owner creates projects.");
        verify(mcp, never()).callTool(any(), any(), any());
        verify(projectService, never()).createProject(anyString(), anyLong(), any());
        verify(records).append(eq(RECORD), eq("action.result"), any(), any());
        verify(records, never()).append(eq(RECORD), eq("human.decision"), any(), any());
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
        verify(issueService, never()).createIssue(anyString(), anyLong(), any(), anyLong(), any(), any());
    }
}
