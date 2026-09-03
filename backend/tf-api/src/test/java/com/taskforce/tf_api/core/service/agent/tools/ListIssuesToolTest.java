package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** Tests unitaires — {@link ListIssuesTool} (outil interne de lecture des issues, TF-MCP-03). */
@ExtendWith(MockitoExtension.class)
@DisplayName("ListIssuesTool")
class ListIssuesToolTest {

    @Mock private IssueService issueService;

    private ListIssuesTool tool() { return new ListIssuesTool(issueService); }

    private IssueResponse issue(String id, String title, String status, IssuePriority pr) {
        return IssueResponse.builder().identifier(id).title(title)
            .status(IssueStatusResponse.builder().name(status).build()).priority(pr).build();
    }

    @Test
    @DisplayName("sans projectId → mes issues (listMyIssues), pas listIssues")
    void lists_my_issues_without_project() {
        when(issueService.listMyIssues(eq("acme"), eq(7L)))
            .thenReturn(List.of(issue("WEB-1", "Bug login", "Todo", IssuePriority.HIGH)));

        String out = tool().execute(Map.of(), new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("WEB-1").contains("Bug login").contains("Todo").contains("HIGH");
        org.mockito.Mockito.verify(issueService, org.mockito.Mockito.never()).listIssues(any(), any(), any());
    }

    @Test
    @DisplayName("avec projectId → issues du projet (listIssues)")
    void lists_project_issues_with_project() {
        when(issueService.listIssues(eq("acme"), eq(3L), eq(7L)))
            .thenReturn(List.of(issue("WEB-2", "Feature X", "Doing", IssuePriority.MEDIUM)));

        Map<String, Object> args = Map.of("projectId", 3);
        String out = tool().execute(args, new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("WEB-2").contains("Feature X").contains("Doing");
    }

    @Test
    @DisplayName("aucune issue → message clair")
    void empty_message() {
        when(issueService.listMyIssues(eq("acme"), eq(7L))).thenReturn(List.of());
        assertThat(tool().execute(Map.of(), new AgentContext("acme", 1L, 7L))).contains("Aucune issue");
    }
}
