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

import com.taskforce.tf_api.core.dto.request.AddIssueToCycleRequest;
import com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest;
import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectMemberResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.CycleService;
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
    @Mock private CycleService cycleService;

    private CreateIssueTool tool() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            ProjectResponse.builder().id(3L).identifier("TF").name("TaskForce").build(),
            ProjectResponse.builder().id(5L).identifier("API").name("API Platform").build()));
        return bare();
    }

    /** L'outil, sans les projets du workspace : pour ce qui ne résout pas de projet. */
    private CreateIssueTool bare() {
        return new CreateIssueTool(issueService, new ProjectResolver(projectService), projectService, cycleService, CLOCK);
    }

    private static IssueStatusResponse column(Long id, String name, IssueStatusCategory category, boolean isDefault) {
        return IssueStatusResponse.builder().id(id).name(name).category(category).isDefault(isDefault).build();
    }

    private void created(String column, LocalDate due) {
        when(issueService.createIssue(eq("acme"), eq(3L), any(), eq(7L), eq("Cortex"))).thenReturn(IssueResponse.builder()
            .id(99L).identifier("TF-9").title("Rate limiting").projectName("TaskForce")
            .status(IssueStatusResponse.builder().name(column).build()).dueDate(due).build());
    }

    /** Ce que l'outil a demandé au service, par la carte de Cortex : l'activité dira « prepared by Cortex ». */
    private CreateIssueRequest sent() {
        ArgumentCaptor<CreateIssueRequest> cap = ArgumentCaptor.forClass(CreateIssueRequest.class);
        verify(issueService).createIssue(eq("acme"), eq(3L), cap.capture(), eq(7L), eq("Cortex"));
        return cap.getValue();
    }

    private void nothingCreated() {
        verify(issueService, never()).createIssue(any(), any(), any(), any(), any());
        verify(issueService, never()).createIssue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("métadonnées : project et title requis ; chaque description tient dans les 160 caractères envoyés")
    void metadata() {
        CreateIssueTool t = bare();
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
        nothingCreated();
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
            nothingCreated();
        }
    }

    @Test
    @DisplayName("projet inconnu : les choix, rien de créé, jamais un projet pris au hasard")
    void unknown_project() {
        String out = tool().execute(Map.of("project", "Mobile", "title", "X"), CTX);

        assertThat(out).startsWith("No project matches \"Mobile\"").contains("TF (TaskForce)");
        nothingCreated();
    }

    @Test
    @DisplayName("la réponse ne dit plus « in TaskForce » ni l'identifiant interne : le projet et la colonne écrits")
    void answer_names_the_project_not_the_product() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting"), CTX);

        assertThat(out).doesNotContain("in TaskForce:").doesNotContain("(id ");
    }

    @ParameterizedTest(name = "paramètre « {0} » : une checklist, et la réponse la nomme ainsi")
    @CsvSource({
        "checklist",
        "subtasks", // l'ancien nom : une carte préparée avant se crée toujours
    })
    @DisplayName("les étapes forment la checklist de l'issue, sans les lignes vides, et la réponse dit « a checklist »")
    void the_steps_become_the_checklist(String parameter) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);
        Map<String, Object> args = new HashMap<>(Map.of("project", "TF", "title", "Rate limiting"));
        args.put(parameter, Arrays.asList("Plan table", " ", null, "  Link from the menu "));

        String out = tool().execute(args, CTX);

        ArgumentCaptor<CreateChecklistItemRequest> items = ArgumentCaptor.forClass(CreateChecklistItemRequest.class);
        verify(issueService, times(2)).addChecklistItem(eq("acme"), eq(3L), eq(99L), eq(7L), items.capture());
        assertThat(items.getAllValues()).extracting(CreateChecklistItemRequest::getContent)
            .containsExactly("Plan table", "Link from the menu");
        assertThat(out).endsWith(", with a checklist of 2 items.").doesNotContain("subtask");
    }

    @Test
    @DisplayName("une checklist d'une ligne : « a checklist of 1 item »")
    void a_checklist_of_one_item() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "checklist", List.of("Plan table")), CTX);

        assertThat(out).endsWith(", with a checklist of 1 item.");
    }

    @Test
    @DisplayName("sans liste, aucune checklist")
    void no_list_no_checklist() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "checklist", "Plan table"), CTX);

        verify(issueService, never()).addChecklistItem(any(), any(), any(), any(), any());
        assertThat(out).doesNotContain("checklist");
    }

    @Test
    @DisplayName("le schéma dit « checklist », jamais « subtasks » : le modèle n'annonce plus de sous-tâches")
    void the_schema_says_checklist() {
        CreateIssueTool t = bare();
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> properties = (Map<String, Map<String, Object>>) t.parametersSchema().get("properties");

        assertThat(properties).containsKey("checklist").doesNotContainKey("subtasks");
        assertThat(t.description()).contains("checklist").doesNotContainIgnoringCase("subtask");
        properties.values().forEach(p -> assertThat((String) p.get("description")).doesNotContainIgnoringCase("subtask"));
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

    // ── assigné, labels, points et cycle : seulement ce qui existe (recette du 01/11/2026) ────────────────────────────

    private static final List<ProjectMemberResponse> MEMBERS = List.of(
        member(7L, "Pierre Michel", "pierre@acme.dev"),
        member(8L, "Marie Curie", "marie@acme.dev"),
        member(9L, "Marie Dupont", "mdupont@acme.dev"),
        member(10L, null, "linus@acme.dev"));

    private static ProjectMemberResponse member(Long userId, String name, String email) {
        return ProjectMemberResponse.builder().userId(userId).displayName(name).email(email).build();
    }

    private static CycleResponse cycle(Long id, String name, CycleStatus status) {
        return CycleResponse.builder().id(id).name(name).status(status).build();
    }

    @ParameterizedTest(name = "assignee « {0} » : membre {1}")
    @CsvSource(delimiter = '|', value = {
        "marie@acme.dev | 8  | Marie Curie",     // l'e-mail exact, ce que la carte renvoie
        "pierre michel  | 7  | Pierre Michel",   // le nom exact, sans tenir compte de la casse
        "Curie          | 8  | Marie Curie",     // une partie du nom qui ne désigne qu'une personne
        "linus          | 10 | linus@acme.dev",  // le début de l'e-mail ; sans nom, l'e-mail le dit
    })
    void assigns_a_member_of_the_project(String asked, Long userId, String shown) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        when(projectService.listMembers("acme", 3L, 7L)).thenReturn(MEMBERS);
        created("Backlog", null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "assignee", asked), CTX);

        assertThat(sent().getAssigneeId()).isEqualTo(userId);
        assertThat(out).contains(", assigned to " + shown);
    }

    @ParameterizedTest(name = "assignee « {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        "Marie | Several members of TaskForce match \"Marie\": Marie Curie (marie@acme.dev), Marie Dupont (mdupont@acme.dev). Ask the person which one",
        "Bob   | No member of TaskForce matches \"Bob\". Its members are: Pierre Michel, Marie Curie, Marie Dupont, linus@acme.dev.",
    })
    void never_picks_nor_invents_a_member(String asked, String problem) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        when(projectService.listMembers("acme", 3L, 7L)).thenReturn(MEMBERS);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "assignee", asked), CTX);

        assertThat(out).startsWith(problem);
        nothingCreated();
    }

    @Test
    @DisplayName("labels : ceux du projet, par leur nom ; un label inconnu arrête la création et donne les labels")
    void labels_are_the_projects_own() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        when(projectService.listLabels("acme", 3L, 7L)).thenReturn(List.of(
            ProjectLabelResponse.builder().id(41L).name("Bug").build(),
            ProjectLabelResponse.builder().id(42L).name("Frontend").build()));
        created("Backlog", null);

        tool().execute(Map.of("project", "TF", "title", "Rate limiting", "labels", List.of("bug", "Frontend", "BUG")), CTX);

        assertThat(sent().getLabelIds()).containsExactly(41L, 42L);
    }

    @Test
    @DisplayName("un label qui n'existe pas n'est jamais créé : rien de créé, les labels du projet")
    void an_unknown_label_is_never_invented() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        when(projectService.listLabels("acme", 3L, 7L)).thenReturn(List.of(ProjectLabelResponse.builder().id(41L).name("Bug").build()));

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "labels", List.of("urgent")), CTX);

        assertThat(out).isEqualTo("There is no label \"urgent\" in TaskForce. Its labels are: Bug. Use existing labels only, or none.");
        nothingCreated();
    }

    @Test
    @DisplayName("cycle : l'un de ceux du projet ; l'issue y entre après sa création, et la réponse le dit")
    void puts_the_issue_in_an_existing_cycle() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        when(cycleService.listCycles("acme", 3L, 7L)).thenReturn(List.of(
            cycle(20L, "Cycle 11", CycleStatus.COMPLETED), cycle(21L, "Cycle 12", CycleStatus.ACTIVE)));
        created("Backlog", null);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "cycle", "cycle 12"), CTX);

        ArgumentCaptor<AddIssueToCycleRequest> added = ArgumentCaptor.forClass(AddIssueToCycleRequest.class);
        verify(cycleService).addIssueToCycle(eq("acme"), eq(3L), eq(21L), added.capture(), eq(7L));
        assertThat(added.getValue().getIssueId()).isEqualTo(99L);
        assertThat(out).contains(", in the cycle Cycle 12");
    }

    @ParameterizedTest(name = "cycle « {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        "Cycle 11 | The cycle Cycle 11 of TaskForce is completed. Its open cycles are: Cycle 12 (active), Cycle 13.",
        "Sprint 9 | There is no cycle \"Sprint 9\" in TaskForce. Its open cycles are: Cycle 12 (active), Cycle 13.",
    })
    void a_cycle_is_never_created_nor_reopened(String asked, String problem) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        when(cycleService.listCycles("acme", 3L, 7L)).thenReturn(List.of(
            cycle(20L, "Cycle 11", CycleStatus.COMPLETED), cycle(21L, "Cycle 12", CycleStatus.ACTIVE),
            cycle(22L, "Cycle 13", CycleStatus.DRAFT)));

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "cycle", asked), CTX);

        assertThat(out).startsWith(problem);
        nothingCreated();
        verify(cycleService, never()).addIssueToCycle(any(), any(), any(), any(), any());
    }

    @ParameterizedTest(name = "points « {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        "3    | 3",
        "' 5 '| 5",
        "0    |",   // 0 : aucune estimation
    })
    void reads_the_points(String points, Integer expected) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        tool().execute(Map.of("project", "TF", "title", "Rate limiting", "points", points), CTX);

        assertThat(sent().getStoryPoints()).isEqualTo(expected);
    }

    @Test
    @DisplayName("points en nombre, tels que le modèle les envoie")
    void reads_numeric_points() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        tool().execute(Map.of("project", "TF", "title", "Rate limiting", "points", 8), CTX);

        assertThat(sent().getStoryPoints()).isEqualTo(8);
    }

    @ParameterizedTest(name = "points {0} : refusés")
    @CsvSource({"lots", "101", "-1"})
    void refuses_points_out_of_range(String points) {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);

        String out = tool().execute(Map.of("project", "TF", "title", "Rate limiting", "points", points), CTX);

        assertThat(out).isEqualTo("points must be a whole number from 1 to 100, or none.");
        nothingCreated();
    }

    @Test
    @DisplayName("des points qui ne sont pas entiers sont refusés")
    void refuses_fractional_points() {
        assertThat(CreateIssueTool.points(2.5).ok()).isFalse();
        assertThat(CreateIssueTool.points(3.0).value()).isEqualTo(3);
        assertThat(CreateIssueTool.points(null).value()).isNull();
    }

    @Test
    @DisplayName("sans assigné, labels, points ni cycle : rien n'est lu ni rempli au hasard")
    void optional_fields_stay_empty() {
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(COLUMNS);
        created("Backlog", null);

        tool().execute(Map.of("project", "TF", "title", "Rate limiting"), CTX);

        CreateIssueRequest req = sent();
        assertThat(req.getAssigneeId()).isNull();
        assertThat(req.getLabelIds()).isNull();
        assertThat(req.getStoryPoints()).isNull();
        verify(projectService, never()).listMembers(any(), any(), any());
        verify(projectService, never()).listLabels(any(), any(), any());
        verify(cycleService, never()).listCycles(any(), any(), any());
        verify(cycleService, never()).addIssueToCycle(any(), any(), any(), any(), any());
    }
}
