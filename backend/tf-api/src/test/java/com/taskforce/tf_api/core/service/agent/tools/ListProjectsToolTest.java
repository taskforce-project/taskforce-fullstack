package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** Tests unitaires — {@link ListProjectsTool} (outil interne de lecture des projets, TF-MCP-03). */
@ExtendWith(MockitoExtension.class)
@DisplayName("ListProjectsTool")
class ListProjectsToolTest {

    @Mock private ProjectService projectService;

    private ListProjectsTool tool() { return new ListProjectsTool(projectService); }

    @Test
    @DisplayName("métadonnées : name list_projects + schema object")
    void metadata() {
        var t = tool();
        assertThat(t.name()).isEqualTo("list_projects");
        assertThat(t.parametersSchema()).containsEntry("type", "object");
    }

    @Test
    @DisplayName("execute : identifiant/nom/id + compteurs d'issues")
    void execute_lists_projects() {
        when(projectService.listProjects(eq("acme"), eq(7L))).thenReturn(List.of(
            ProjectResponse.builder().id(3L).identifier("WEB").name("Web App").openIssues(4).totalIssues(9).build(),
            ProjectResponse.builder().id(5L).identifier("API").name("API").openIssues(1).totalIssues(2).build()));

        String out = tool().execute(Map.of(), new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("WEB").contains("Web App").contains("id 3").contains("4/9").contains("API");
    }

    @Test
    @DisplayName("execute : aucun projet → message clair")
    void execute_empty() {
        when(projectService.listProjects(eq("acme"), eq(7L))).thenReturn(List.of());
        assertThat(tool().execute(Map.of(), new AgentContext("acme", 1L, 7L))).contains("Aucun projet");
    }
}
