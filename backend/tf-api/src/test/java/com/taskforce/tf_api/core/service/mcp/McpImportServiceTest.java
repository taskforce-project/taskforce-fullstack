package com.taskforce.tf_api.core.service.mcp;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Tests unitaires — {@link McpImportService} (TF-MCP-04 : import d'un projet externe via MCP). */
@ExtendWith(MockitoExtension.class)
@DisplayName("McpImportService")
class McpImportServiceTest {

    @Mock private WorkspaceMcpService workspaceMcp;
    @Mock private ProjectService projectService;
    @Mock private IssueService issueService;
    @Mock private LlmClient llm;

    private McpImportService service;
    private final Workspace ws = Workspace.builder().id(10L).slug("acme").build();

    @BeforeEach
    void setup() {
        service = new McpImportService(workspaceMcp, projectService, issueService, llm, new ObjectMapper());
        ReflectionTestUtils.setField(service, "model", "m");
    }

    private void connectorWithTools(String... tools) {
        when(workspaceMcp.serverStatuses(10L)).thenReturn(List.of(
            new WorkspaceMcpService.McpServerStatus("linear", "https://mcp.linear.app/mcp", true, List.of(tools), null)));
    }

    @Test
    @DisplayName("import : trouve list_issues, normalise via LLM, crée le projet + les issues")
    void imports_project() {
        connectorWithTools("list_issues", "save_issue");
        when(workspaceMcp.execute(eq(10L), eq("linear__list_issues"), any())).thenReturn("<données brutes Linear>");
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(eq("m"), anyString(), anyString(), eq(true))).thenReturn(
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
    }

    @Test
    @DisplayName("import : connecteur sans outil d'issues → erreur claire, aucun projet créé")
    void fails_when_no_issues_tool() {
        connectorWithTools("save_document");

        assertThatThrownBy(() -> service.importProject(ws, 7L, "linear", "X"))
            .isInstanceOf(BusinessException.class);
        verify(projectService, never()).createProject(anyString(), anyLong(), any());
    }

    @Test
    @DisplayName("import : normalisation illisible → projet créé mais vide (found=0)")
    void empty_when_unparseable() {
        connectorWithTools("list_issues");
        when(workspaceMcp.execute(eq(10L), eq("linear__list_issues"), any())).thenReturn("bla");
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(anyString(), anyString(), anyString(), eq(true))).thenReturn("pas du json");
        when(projectService.createProject(eq("acme"), eq(7L), any()))
            .thenReturn(ProjectResponse.builder().id(99L).identifier("X").name("X").build());

        McpImportService.ImportResult r = service.importProject(ws, 7L, "linear", "X");

        assertThat(r.found()).isZero();
        assertThat(r.imported()).isZero();
        verify(issueService, never()).createIssue(anyString(), anyLong(), any(), anyLong());
    }
}
