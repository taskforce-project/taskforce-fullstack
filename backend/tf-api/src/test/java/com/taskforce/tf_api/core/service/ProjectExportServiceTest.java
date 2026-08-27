package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.IssueExport;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.ProjectExport;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link ProjectExportService} : assemblage de l'export (réutilise IssueService, déjà
 * autorisé) et mise en forme CSV (échappement RFC 4180).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProjectExportService")
class ProjectExportServiceTest {

    @Mock private IssueService issueService;
    @Mock private ProjectRepository projectRepository;
    @Mock private WorkspaceRepository workspaceRepository;

    @InjectMocks private ProjectExportService service;

    @Test
    @DisplayName("export : assemble le projet + ses issues (avec commentaires/activité) via IssueService")
    void export_assembles_project_with_issues() {
        IssueResponse issue = IssueResponse.builder().id(10L).identifier("WEB-10").title("T").build();
        when(issueService.listIssues("acme", 1L, 7L)).thenReturn(List.of(issue));
        when(issueService.listComments("acme", 1L, 10L, 7L)).thenReturn(List.of());
        when(issueService.listActivity("acme", 1L, 10L, 7L)).thenReturn(List.of());
        when(workspaceRepository.findBySlug("acme"))
            .thenReturn(Optional.of(Workspace.builder().id(2L).slug("acme").name("Acme").build()));
        when(projectRepository.findByIdAndWorkspaceId(1L, 2L))
            .thenReturn(Optional.of(Project.builder().id(1L).identifier("WEB").name("Web App").description("d").build()));

        ProjectExport export = service.export("acme", 1L, 7L);

        assertThat(export.identifier()).isEqualTo("WEB");
        assertThat(export.name()).isEqualTo("Web App");
        assertThat(export.issueCount()).isEqualTo(1);
        assertThat(export.issues()).hasSize(1);
        assertThat(export.issues().get(0).issue().getIdentifier()).isEqualTo("WEB-10");
    }

    @Test
    @DisplayName("toCsv : en-tête + une ligne par issue, échappement virgule/guillemet, champs nuls → vides")
    void toCsv_flattens_and_escapes() {
        IssueResponse issue = IssueResponse.builder()
            .id(1L).identifier("WEB-1").title("Titre, avec virgule")
            .description("Ligne \"citée\"")
            .priority(IssuePriority.HIGH)
            .storyPoints(5)
            .dueDate(LocalDate.of(2026, 9, 10))
            .build(); // status/assignee/reporter/labels nuls → colonnes vides
        ProjectExport export = new ProjectExport("WEB", "Web App", "desc", "2026-08-27T00:00:00Z", 1,
            List.of(new IssueExport(issue, List.of(), List.of())));

        String[] lines = service.toCsv(export).split("\n", -1);

        assertThat(lines[0]).isEqualTo(
            "Identifier,Title,Status,Priority,Assignee,Reporter,Labels,StoryPoints,DueDate,CreatedAt,CompletedAt,Comments,Description");
        assertThat(lines[1]).startsWith("WEB-1,\"Titre, avec virgule\",,HIGH,");   // titre encadré, status vide
        assertThat(lines[1]).contains(",5,2026-09-10,");                          // points + due date
        assertThat(lines[1]).endsWith(",0,\"Ligne \"\"citée\"\"\"");              // 0 commentaire + description échappée
    }
}
