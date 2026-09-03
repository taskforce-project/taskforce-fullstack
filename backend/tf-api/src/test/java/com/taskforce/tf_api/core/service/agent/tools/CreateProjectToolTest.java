package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** Tests unitaires — {@link CreateProjectTool} (fondation import TF-MCP-04). */
@ExtendWith(MockitoExtension.class)
@DisplayName("CreateProjectTool")
class CreateProjectToolTest {

    @Mock private ProjectService projectService;

    private CreateProjectTool tool() { return new CreateProjectTool(projectService); }

    @Test
    @DisplayName("métadonnées : name create_project + name requis")
    void metadata() {
        var t = tool();
        assertThat(t.name()).isEqualTo("create_project");
        @SuppressWarnings("unchecked")
        List<String> required = (List<String>) t.parametersSchema().get("required");
        assertThat(required).contains("name");
    }

    @Test
    @DisplayName("execute : mappe name/identifier/description et délègue à createProject")
    void execute_creates_project() {
        when(projectService.createProject(eq("acme"), eq(7L), any()))
            .thenReturn(ProjectResponse.builder().id(12L).identifier("WEB").name("Web App").build());
        Map<String, Object> args = Map.of("name", "Web App", "identifier", "web", "description", "app web");

        String out = tool().execute(args, new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("WEB").contains("Web App").contains("12");
        ArgumentCaptor<CreateProjectRequest> cap = ArgumentCaptor.forClass(CreateProjectRequest.class);
        org.mockito.Mockito.verify(projectService).createProject(eq("acme"), eq(7L), cap.capture());
        CreateProjectRequest req = cap.getValue();
        assertThat(req.getName()).isEqualTo("Web App");
        assertThat(req.getIdentifier()).isEqualTo("WEB"); // « web » -> majuscules
        assertThat(req.getDescription()).isEqualTo("app web");
    }

    @Test
    @DisplayName("execute : identifier absent → dérivé du nom (alphanumérique majuscule)")
    void execute_derives_identifier() {
        when(projectService.createProject(any(), any(), any()))
            .thenReturn(ProjectResponse.builder().id(1L).identifier("MOBILEAPP").name("Mobile App!").build());
        Map<String, Object> args = Map.of("name", "Mobile App!");

        tool().execute(args, new AgentContext("acme", 1L, 7L));

        ArgumentCaptor<CreateProjectRequest> cap = ArgumentCaptor.forClass(CreateProjectRequest.class);
        org.mockito.Mockito.verify(projectService).createProject(any(), any(), cap.capture());
        // « Mobile App! » -> « MOBILEAPP » (alnum majuscule, tronqué à 10)
        assertThat(cap.getValue().getIdentifier()).isEqualTo("MOBILEAPP");
    }

    @Test
    @DisplayName("execute : name manquant → message, aucun appel service")
    void execute_missing_name() {
        String out = tool().execute(Map.of(), new AgentContext("acme", 1L, 7L));
        assertThat(out).contains("name manquant");
        org.mockito.Mockito.verifyNoInteractions(projectService);
    }
}
