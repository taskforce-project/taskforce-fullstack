package com.taskforce.tf_api.core.api;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.CortexSourcesResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.agent.CortexSourcesService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tests de tranche web : {@link CortexSourcesController}, ce que Cortex peut lire dans un espace. Service mocké. */
@WebMvcTest(CortexSourcesController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("CortexSourcesController (@WebMvcTest)")
class CortexSourcesControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private CortexSourcesService sourcesService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/assistant/sources";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET : chaque source comptée, avec son dernier changement")
    void sources_200() throws Exception {
        when(sourcesService.sources("acme", 7L)).thenReturn(new CortexSourcesResponse(List.of(
            new CortexSourcesResponse.Source("projects", 4, LocalDateTime.of(2026, 11, 7, 18, 2)),
            new CortexSourcesResponse.Source("connectors", 0, null))));

        mockMvc.perform(get(URL).with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.sources[0].key").value("projects"))
            .andExpect(jsonPath("$.data.sources[0].count").value(4))
            .andExpect(jsonPath("$.data.sources[1].changedAt").doesNotExist());
    }

    @Test
    @DisplayName("hors de l'espace : 403")
    void stranger_403() throws Exception {
        when(sourcesService.sources("acme", 7L)).thenThrow(new ForbiddenException("Access denied"));

        mockMvc.perform(get(URL).with(auth())).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("sans jeton : 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
    }
}
