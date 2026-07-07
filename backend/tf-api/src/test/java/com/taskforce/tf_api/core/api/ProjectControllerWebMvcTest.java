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

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web — {@link ProjectController} (endpoints get/activity/update/archive/favorite/
 * membres/teams/labels). {@code ProjectService} mocké ; contrat HTTP (200/2xx).
 */
@WebMvcTest(ProjectController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("ProjectController (@WebMvcTest)")
class ProjectControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ProjectService projectService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String P = "/api/workspaces/acme/projects/5";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET get / activity / members / teams / labels → 200")
    void gets() throws Exception {
        var a = auth();
        when(projectService.getProject(anyString(), anyLong(), anyLong())).thenReturn(null);
        when(projectService.getProjectActivity(anyString(), anyLong(), anyLong(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of());
        when(projectService.listMembers(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        when(projectService.listProjectTeams(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        when(projectService.listLabels(anyString(), anyLong(), anyLong())).thenReturn(List.of());

        mockMvc.perform(get(P).with(a)).andExpect(status().isOk());
        mockMvc.perform(get(P + "/activity").with(a)).andExpect(status().isOk());
        mockMvc.perform(get(P + "/members").with(a)).andExpect(status().isOk());
        mockMvc.perform(get(P + "/teams").with(a)).andExpect(status().isOk());
        mockMvc.perform(get(P + "/labels").with(a)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("PATCH update / POST archive / favorite / DELETE favorite → 2xx")
    void mutations() throws Exception {
        var a = auth();
        when(projectService.updateProject(anyString(), anyLong(), anyLong(), any())).thenReturn(null);
        when(projectService.archiveProject(anyString(), anyLong(), anyLong())).thenReturn(null);
        when(projectService.favoriteProject(anyString(), anyLong(), anyLong())).thenReturn(null);
        when(projectService.unfavoriteProject(anyString(), anyLong(), anyLong())).thenReturn(null);

        mockMvc.perform(patch(P).with(a).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"New\"}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(post(P + "/archive").with(a)).andExpect(status().is2xxSuccessful());
        mockMvc.perform(post(P + "/favorite").with(a)).andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(P + "/favorite").with(a)).andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /labels + DELETE /{id} → 2xx")
    void label_and_delete() throws Exception {
        var a = auth();
        when(projectService.createLabel(anyString(), anyLong(), anyLong(), any())).thenReturn(null);

        mockMvc.perform(post(P + "/labels").with(a).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Bug\"}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(P).with(a)).andExpect(status().is2xxSuccessful());
    }
}
