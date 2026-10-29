package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.IssueSummaryResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.dto.response.UserSummaryResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link ListIssuesTool} : les issues filtrées comme on les cherche (projet, colonne, les miennes), et
 * pour une issue ouverte, ce qui la bloque (R52, séance n°8).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ListIssuesTool")
class ListIssuesToolTest {

    private static final AgentContext CTX = new AgentContext("acme", 1L, 7L);

    @Mock private IssueService issueService;
    @Mock private ProjectService projectService;
    @Mock private DeliveryService deliveryService;

    private ListIssuesTool tool() {
        lenient().when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            ProjectResponse.builder().id(3L).identifier("TF").name("TaskForce").build(),
            ProjectResponse.builder().id(5L).identifier("API").name("API Platform").build()));
        // Par défaut, rien ne bloque : chaque test pose ce qui le concerne.
        lenient().when(issueService.listBlockers(any(), any(), any(), any())).thenReturn(List.of());
        lenient().when(deliveryService.latestRun(any(), any(), any())).thenReturn(Optional.empty());
        return new ListIssuesTool(issueService, new ProjectResolver(projectService), deliveryService);
    }

    private static IssueResponse issue(Long id, String key, String title, String status, IssueStatusCategory category,
                                       Long projectId, String projectName, Long assigneeId) {
        return IssueResponse.builder().id(id).identifier(key).title(title).projectId(projectId).projectName(projectName)
            .status(IssueStatusResponse.builder().name(status).category(category).build())
            .priority(IssuePriority.HIGH)
            .assignee(assigneeId == null ? null : UserSummaryResponse.builder().id(assigneeId).build())
            .build();
    }

    private static DeliveryRunResponse failedRun(boolean refused, String error) {
        return new DeliveryRunResponse(1L, 40L, "TF-4", "Fix", 3L, "TaskForce", "claude-code", null, "FAILED", null,
            null, error, refused, 7L, null, null);
    }

    @Test
    @DisplayName("sans filtre : mes issues assignées, rien d'autre")
    void lists_my_issues_without_filter() {
        when(issueService.listMyIssues("acme", 7L)).thenReturn(List.of(
            issue(1L, "TF-1", "Bug login", "Todo", IssueStatusCategory.UNSTARTED, 3L, "TaskForce", 7L)));

        String out = tool().execute(Map.of(), CTX);

        assertThat(out).startsWith("Issues assigned to you (1):").contains("TF-1 Bug login [Todo] HIGH, project TaskForce");
        verify(issueService, never()).listIssues(any(), any(), any());
    }

    @Test
    @DisplayName("project : les issues de ce projet, par sa clé")
    void lists_the_issues_of_a_project() {
        when(issueService.listIssues("acme", 5L, 7L)).thenReturn(List.of(
            issue(2L, "API-2", "Feature X", "In Progress", IssueStatusCategory.STARTED, 5L, "API Platform", null)));

        String out = tool().execute(Map.of("project", "API"), CTX);

        assertThat(out).startsWith("Issues in API Platform (1):").contains("API-2 Feature X [In Progress]");
    }

    @ParameterizedTest(name = "status « {0} » sans projet : {1} issue(s) de tout l'espace")
    @CsvSource({"Blocked, 2", "blocked, 2", "Todo, 1", "Done, 0"})
    void filters_on_a_column_across_projects(String column, int expected) {
        when(issueService.listIssues("acme", 3L, 7L)).thenReturn(List.of(
            issue(4L, "TF-4", "Deploy", "Blocked", IssueStatusCategory.STARTED, 3L, "TaskForce", null),
            issue(5L, "TF-5", "Docs", "Todo", IssueStatusCategory.UNSTARTED, 3L, "TaskForce", null)));
        when(issueService.listIssues("acme", 5L, 7L)).thenReturn(List.of(
            issue(6L, "API-6", "Quota", "Blocked", IssueStatusCategory.STARTED, 5L, "API Platform", null)));

        String out = tool().execute(Map.of("status", column), CTX);

        if (expected == 0) {
            assertThat(out).isEqualTo("No issue in the workspace in the column " + column + ".");
        } else {
            assertThat(out).contains("in the column " + column + " (" + expected + "):");
        }
    }

    @Test
    @DisplayName("mine dans un projet : seulement celles qui me sont assignées")
    void keeps_mine_in_a_project() {
        when(issueService.listIssues("acme", 3L, 7L)).thenReturn(List.of(
            issue(1L, "TF-1", "Mine", "Todo", IssueStatusCategory.UNSTARTED, 3L, "TaskForce", 7L),
            issue(2L, "TF-2", "Theirs", "Todo", IssueStatusCategory.UNSTARTED, 3L, "TaskForce", 8L)));

        String out = tool().execute(Map.of("project", "TaskForce", "mine", true), CTX);

        assertThat(out).contains("TF-1 Mine").doesNotContain("TF-2");
    }

    @ParameterizedTest(name = "run {0} : « {1} »")
    @CsvSource(delimiter = '|', quoteCharacter = '"', value = { // les apostrophes des messages ne sont pas des guillemets
        "false | the agent's run failed: OAuth session expired",
        "true  | the agent did not start: TaskForce doesn't start missions on public repositories yet.",
    })
    void says_why_an_open_issue_is_blocked(boolean refused, String cause) {
        when(issueService.listIssues("acme", 3L, 7L)).thenReturn(List.of(
            issue(4L, "TF-4", "Deploy", "Blocked", IssueStatusCategory.STARTED, 3L, "TaskForce", null)));
        ListIssuesTool tool = tool();
        when(issueService.listBlockers("acme", 3L, 4L, 7L)).thenReturn(List.of(
            IssueSummaryResponse.builder().id(3L).identifier("TF-3").build()));
        String error = cause.substring(cause.indexOf(": ") + 2);
        when(deliveryService.latestRun("acme", 4L, 7L)).thenReturn(Optional.of(failedRun(refused, error)));

        String out = tool.execute(Map.of("project", "TF"), CTX);

        assertThat(out).contains("TF-4 Deploy [Blocked] HIGH, blocked by TF-3, " + cause);
    }

    @Test
    @DisplayName("une issue terminée ne se détaille pas : aucune cause cherchée")
    void a_closed_issue_has_no_cause() {
        when(issueService.listIssues("acme", 3L, 7L)).thenReturn(List.of(
            issue(9L, "TF-9", "Shipped", "Done", IssueStatusCategory.COMPLETED, 3L, "TaskForce", null)));

        String out = tool().execute(Map.of("project", "TF"), CTX);

        assertThat(out).contains("TF-9 Shipped [Done]");
        verify(issueService, never()).listBlockers(any(), any(), eq(9L), any());
        verify(deliveryService, never()).latestRun(any(), anyLong(), any());
    }

    @Test
    @DisplayName("une cause illisible ne retire pas l'issue de la liste")
    void an_unreadable_cause_keeps_the_issue() {
        when(issueService.listIssues("acme", 3L, 7L)).thenReturn(List.of(
            issue(4L, "TF-4", "Deploy", "Blocked", IssueStatusCategory.STARTED, 3L, "TaskForce", null)));
        ListIssuesTool tool = tool();
        when(issueService.listBlockers("acme", 3L, 4L, 7L)).thenThrow(new IllegalStateException("boom"));

        String out = tool.execute(Map.of("project", "TF"), CTX);

        assertThat(out).contains("TF-4 Deploy [Blocked] HIGH").doesNotContain("boom");
    }

    @Test
    @DisplayName("projet inconnu : les choix, aucune liste")
    void unknown_project() {
        String out = tool().execute(Map.of("project", "Mobile"), CTX);

        assertThat(out).startsWith("No project matches \"Mobile\"");
        verify(issueService, never()).listIssues(any(), any(), any());
    }

    @Test
    @DisplayName("aucune issue : un message clair")
    void empty_message() {
        when(issueService.listMyIssues("acme", 7L)).thenReturn(List.of());
        assertThat(tool().execute(Map.of(), CTX)).isEqualTo("No issue assigned to you.");
    }
}
