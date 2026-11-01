package com.taskforce.tf_api.core.service.agent.tools;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link CreateIssueTool} : le projet par sa clé ou son nom, l'issue placée dans le temps (le Backlog
 * par défaut, la colonne et l'échéance quand le but les donne), la réponse tirée de ce que le service a écrit (R48).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("CreateIssueTool")
class CreateIssueToolTest {

    private static final AgentContext CTX = new AgentContext("acme", 1L, 7L);
    /** Le jeudi 29 octobre 2026, à midi UTC. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-29T12:00:00Z"), ZoneOffset.UTC);

    private static final List<IssueStatusResponse> COLUMNS = List.of(
        column(10L, "Backlog", IssueStatusCategory.BACKLOG, false),
        column(11L, "Todo", IssueStatusCategory.UNSTARTED, true),
        column(12L, "In Progress", IssueStatusCategory.STARTED, false));

    @Mock private IssueService issueService;
    @Mock private ProjectService projectService;

    private CreateIssueTool tool() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            ProjectResponse.builder().id(3L).identifier("TF").name("TaskForce").build(),
            ProjectResponse.builder().id(5L).identifier("API").name("API Platform").build()));
        return new CreateIssueTool(issueService, new ProjectResolver(projectService), CLOCK);
    }

    private static IssueStatusResponse column(Long id, String name, IssueStatusCategory category, boolean isDefault) {
        return IssueStatusResponse.builder().id(id).name(name).category(category).isDefault(isDefault).build();
    }

    private void created(String column, LocalDate due) {
        when(issueService.createIssue(eq("acme"), eq(3L), any(), eq(7L))).thenReturn(IssueResponse.builder()
            .id(99L).identifier("TF-9").title("Rate limiting").projectName("TaskForce")
            .status(IssueStatusResponse.builder().name(column).build()).dueDate(due).build());
    }

    private CreateIssueRequest sent() {
        ArgumentCaptor<CreateIssueRequest> cap = ArgumentCaptor.forClass(CreateIssueRequest.class);
        verify(issueService).createIssue(eq("acme"), eq(3L), cap.capture(), eq(7L));
        return cap.getValue();
    }

    @Test
    @DisplayName("métadonnées : project et title requis ; chaque description tient dans les 160 caractères envoyés")
    void metadata() {
        CreateIssueTool t = new CreateIssueTool(issueService, new ProjectResolver(projectService), CLOCK);
        assertThat(t.name()).isEqualTo("create_issue");
        @SuppressWarnings("unchecked")
        List<String> required = (List<String>) t.parametersSchema().get("required");
        assertThat(required).containsExactly("project", "title");
        assertThat(t.description()).hasSizeLessThanOrEqualTo(160);
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> properties = (Map<String, Map<String, Object>>) t.parametersSchema().get("properties");
        properties.values().forEach(p -> assertThat((String) p.get("description")).hasSizeLessThanOrEqualTo(160));
    }

    @ParameterizedTest(name = "status « {0} » : colonne {1}")
    @CsvSource(delimiter = '|', value = {
        "''          | 10 | Backlog",      // rien de demandé : le Backlog, pas la colonne par défaut du projet
        "todo        | 11 | Todo",         // une colonne nommée, sans tenir compte de la casse
        "In Progress | 12 | In Progress",
    })
    void places_the_issue_in_a_column(String status, Long columnId, String columnName) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created(columnName, null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "status", status), CTX);

        assertThat(sent().getStatusId()).isEqualTo(columnId);
        assertThat(out).isEqualTo("Created TF-9 \"Rate limiting\" in the project TaskForce, in the column " + columnName + ".");
    }

    @Test
    @DisplayName("projet sans colonne Backlog : la colonne par défaut du service")
    void no_backlog_column_keeps_the_project_default() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(List.of(COLUMNS.get(1), COLUMNS.get(2)));
        created("Todo", null);

        tool().execute(Map.of("project", "TaskForce", "title", "Rate limiting"), CTX);

        assertThat(sent().getStatusId()).isNull();
    }

    @Test
    @DisplayName("colonne inconnue : les colonnes du projet, rien de créé")
    void unknown_column() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);

        String out = tool().execute(Map.of("project", "TF", "title", "X", "status", "Doing"), CTX);

        assertThat(out).contains("no column \"Doing\" in TaskForce").contains("Backlog, Todo, In Progress");
        verify(issueService, never()).createIssue(any(), any(), any(), any());
    }

    @ParameterizedTest(name = "dueDate « {0} »")
    @CsvSource(delimiter = '|', value = {
        "2026-11-14 | 2026-11-14 | ", // une date à venir
        "2026-10-28 | 2026-10-28 | ", // la veille : un jour de marge, l'instance compte en UTC
        "next week  |            | dueDate must be a date written YYYY-MM-DD",
        "2026-10-01 |            | is in the past (today is 2026-10-29)",
    })
    void reads_the_due_date(String dueDate, LocalDate expected, String problem) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        if (problem == null) created("Backlog", expected);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "dueDate", dueDate), CTX);

        if (problem == null) {
            assertThat(sent().getDueDate()).isEqualTo(expected.toString());
            assertThat(out).endsWith(", due " + expected + ".");
        } else {
            assertThat(out).contains(problem);
            verify(issueService, never()).createIssue(any(), any(), any(), any());
        }
    }

    @Test
    @DisplayName("projet inconnu : les choix, rien de créé, jamais un projet pris au hasard")
    void unknown_project() {
        String out = tool().execute(Map.of("project", "Mobile", "title", "X"), CTX);

        assertThat(out).startsWith("No project matches \"Mobile\"").contains("TF (TaskForce)");
        verify(issueService, never()).createIssue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("la réponse ne dit plus « in TaskForce » ni l'identifiant interne : le projet et la colonne écrits")
    void answer_names_the_project_not_the_product() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting"), CTX);

        assertThat(out).doesNotContain("in TaskForce:").doesNotContain("(id ");
    }

    @Test
    @DisplayName("les sous-tâches deviennent la checklist de l'issue, sans les lignes vides, et la réponse les compte")
    void subtasks_become_the_checklist() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);
        Map<String, Object> args = new HashMap<>(Map.of("project", "TF", "title", "Rate limiting"));
        args.put("subtasks", Arrays.asList("Plan table", " ", null, "  Link from the menu "));

        String out = tool().execute(args, CTX);

        ArgumentCaptor<CreateChecklistItemRequest> items = ArgumentCaptor.forClass(CreateChecklistItemRequest.class);
        verify(issueService, times(2)).addChecklistItem(eq("acme"), eq(3L), eq(99L), eq(7L), items.capture());
        assertThat(items.getAllValues()).extracting(CreateChecklistItemRequest::getContent)
            .containsExactly("Plan table", "Link from the menu");
        assertThat(out).endsWith(", with 2 subtasks.");
    }

    @Test
    @DisplayName("sans liste de sous-tâches, aucune checklist")
    void no_subtasks_no_checklist() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "subtasks", "Plan table"), CTX);

        verify(issueService, never()).addChecklistItem(any(), any(), any(), any(), any());
        assertThat(out).doesNotContain("subtask");
    }

    @ParameterizedTest(name = "priority « {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        "high | HIGH", // sans tenir compte de la casse
        "WAT  |",      // inconnue : la priorité par défaut du service
    })
    void maps_the_priority(String priority, IssuePriority expected) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);
        Map<String, Object> args = new HashMap<>(Map.of("project", "TF", "title", "T", "priority", priority));
        args.put("description", "sur l'API publique");

        tool().execute(args, CTX);

        CreateIssueRequest req = sent();
        assertThat(req.getPriority()).isEqualTo(expected);
        assertThat(req.getDescription()).isEqualTo("sur l'API publique");
    }
}
