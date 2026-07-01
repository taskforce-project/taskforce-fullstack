package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web (couverture C25) — {@link ProjectController}, {@link WorkspaceController},
 * {@link CycleController} via un seul {@code @WebMvcTest} multi-controllers. Vérifie le contrat HTTP :
 * préfixe {@code /api}, enveloppe {@code ApiResponse}, résolution du user via le claim JWT `email`,
 * 200 (list) / 2xx (create) / 401 (sans JWT) / 400 (@Valid).
 */
@WebMvcTest({ProjectController.class, WorkspaceController.class, CycleController.class})
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("Core controllers (@WebMvcTest)")
class CoreControllersWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ProjectService projectService;
    @MockitoBean private WorkspaceService workspaceService;
    @MockitoBean private CycleService cycleService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static final String EMAIL = "dev@it.dev";

    private void stubUser() {
        when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    // ---- GET (list) → 200 + enveloppe -------------------------------------
    @Test
    @DisplayName("GET /projects → 200")
    void list_projects_200() throws Exception {
        stubUser();
        when(projectService.listProjects(anyString(), anyLong())).thenReturn(List.of());

        mockMvc.perform(get("/api/workspaces/acme/projects").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("GET /api/workspaces → 200")
    void list_workspaces_200() throws Exception {
        stubUser();
        when(workspaceService.listWorkspacesByUser(anyLong())).thenReturn(List.of());

        mockMvc.perform(get("/api/workspaces").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("GET /cycles → 200")
    void list_cycles_200() throws Exception {
        stubUser();
        when(cycleService.listCycles(anyString(), anyLong(), anyLong())).thenReturn(List.of());

        mockMvc.perform(get("/api/workspaces/acme/projects/5/cycles").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    // ---- 401 sans JWT ------------------------------------------------------
    @Test
    @DisplayName("GET /projects sans JWT → 401")
    void list_projects_unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/projects"))
            .andExpect(status().isUnauthorized());
    }

    // ---- POST (create) → 2xx ----------------------------------------------
    @Test
    @DisplayName("POST /api/workspaces (create) → 2xx")
    void create_workspace_2xx() throws Exception {
        stubUser();
        when(workspaceService.createNewWorkspace(anyLong(), any()))
            .thenReturn(WorkspaceResponse.builder().slug("new-ws").build());

        mockMvc.perform(post("/api/workspaces").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"New WS\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /projects (create) → 2xx")
    void create_project_2xx() throws Exception {
        stubUser();
        when(projectService.createProject(anyString(), anyLong(), any()))
            .thenReturn(ProjectResponse.builder().id(1L).identifier("APP").build());

        mockMvc.perform(post("/api/workspaces/acme/projects").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"App\",\"identifier\":\"APP\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /cycles (create) → 2xx")
    void create_cycle_2xx() throws Exception {
        stubUser();
        when(cycleService.createCycle(anyString(), anyLong(), any(), anyLong()))
            .thenReturn(CycleResponse.builder().id(1L).name("Sprint 1").build());

        mockMvc.perform(post("/api/workspaces/acme/projects/5/cycles").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Sprint 1\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    // ---- @Valid → 400 ------------------------------------------------------
    @Test
    @DisplayName("POST /projects sans identifier (@NotBlank) → 400")
    void create_project_invalid_400() throws Exception {
        stubUser();

        mockMvc.perform(post("/api/workspaces/acme/projects").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"App\"}"))
            .andExpect(status().isBadRequest());
    }
}
