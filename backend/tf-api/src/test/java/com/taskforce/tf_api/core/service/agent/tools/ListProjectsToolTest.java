package com.taskforce.tf_api.core.service.agent.tools;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link ListProjectsTool} : les projets avec de quoi placer une issue dans le temps (but, colonnes,
 * cycle actif), et aucun identifiant interne à deviner (R48, séance n°8).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ListProjectsTool")
class ListProjectsToolTest {

    private static final AgentContext CTX = new AgentContext("acme", 1L, 7L);

    @Mock private ProjectService projectService;
    @Mock private IssueService issueService;
    @Mock private CycleService cycleService;

    private ListProjectsTool tool() {
        return new ListProjectsTool(new ProjectResolver(projectService), issueService, cycleService);
    }

    private static IssueStatusResponse column(String name) {
        return IssueStatusResponse.builder().name(name).build();
    }

    private static CycleResponse cycle(String name, CycleStatus status, String start, String end) {
        return CycleResponse.builder().name(name).status(status)
            .startDate(LocalDate.parse(start)).endDate(LocalDate.parse(end)).build();
    }

    @Test
    @DisplayName("métadonnées : name list_projects, aucun paramètre, une description qui tient dans les 160 caractères")
    void metadata() {
        ListProjectsTool t = tool();
        assertThat(t.name()).isEqualTo("list_projects");
        assertThat(t.parametersSchema()).containsEntry("type", "object");
        assertThat(t.description()).hasSizeLessThanOrEqualTo(160);
    }

    @Test
    @DisplayName("execute : clé, nom, issues ouvertes, colonnes, cycle actif et but ; aucun identifiant")
    void execute_lists_projects_with_their_timing() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            ProjectResponse.builder().id(3L).identifier("WEB").name("Web App").openIssues(4).totalIssues(9)
                .description("Ship the new   checkout\nbefore Black Friday.").build(),
            ProjectResponse.builder().id(5L).identifier("API").name("API").openIssues(1).totalIssues(2).build()));
        when(issueService.listStatuses("acme", 3L, 7L)).thenReturn(List.of(column("Backlog"), column("Todo"), column("Done")));
        when(cycleService.listCycles("acme", 3L, 7L)).thenReturn(List.of(
            cycle("Cycle 11", CycleStatus.COMPLETED, "2026-10-13", "2026-10-26"),
            cycle("Cycle 12", CycleStatus.ACTIVE, "2026-10-27", "2026-11-09")));
        when(issueService.listStatuses("acme", 5L, 7L)).thenReturn(List.of(column("Todo")));
        when(cycleService.listCycles("acme", 5L, 7L)).thenReturn(List.of());

        String out = tool().execute(Map.of(), CTX);

        assertThat(out).contains("- WEB Web App: 4/9 open; columns: Backlog, Todo, Done; "
                + "active cycle: Cycle 12 (2026-10-27 to 2026-11-09); goal: Ship the new checkout before Black Friday.")
            .contains("- API API: 1/2 open; columns: Todo")
            .doesNotContain("id 3").doesNotContain("Cycle 11");
    }

    @Test
    @DisplayName("des colonnes illisibles ne retirent pas le projet de la liste")
    void an_unreadable_project_stays_listed() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of(
            ProjectResponse.builder().id(3L).identifier("WEB").name("Web App").openIssues(4).totalIssues(9).build()));
        when(issueService.listStatuses("acme", 3L, 7L)).thenThrow(new IllegalStateException("boom"));

        String out = tool().execute(Map.of(), CTX);

        assertThat(out).contains("- WEB Web App: 4/9 open").doesNotContain("columns").doesNotContain("boom");
    }

    @Test
    @DisplayName("execute : aucun projet, un message clair")
    void execute_empty() {
        when(projectService.listProjects("acme", 7L)).thenReturn(List.of());
        assertThat(tool().execute(Map.of(), CTX)).contains("No project");
    }
}
