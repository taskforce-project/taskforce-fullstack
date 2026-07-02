package com.taskforce.tf_api.core.api;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.GitHubIntegrationService;
import com.taskforce.tf_api.core.service.SlackIntegrationService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web — {@link IntegrationController} (statut / repos / disconnect GitHub-Slack).
 * Services d'intégration mockés.
 */
@WebMvcTest(IntegrationController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("IntegrationController (@WebMvcTest)")
class IntegrationControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private GitHubIntegrationService gitHubService;
    @MockitoBean private SlackIntegrationService slackService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", "dev@it.dev"));
    }

    @Test
    @DisplayName("GET github/status, github/repos, slack/status → 200")
    void gets_200() throws Exception {
        when(gitHubService.getStatus(anyString())).thenReturn(null);
        when(gitHubService.listRepositories(anyString())).thenReturn(List.of());
        when(slackService.getStatus(anyString())).thenReturn(null);

        mockMvc.perform(get("/api/workspaces/acme/integrations/github/status").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/integrations/github/repos").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/integrations/slack/status").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("DELETE github (disconnect) → 200")
    void disconnect_200() throws Exception {
        mockMvc.perform(delete("/api/workspaces/acme/integrations/github").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET github/status sans JWT → 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/integrations/github/status")).andExpect(status().isUnauthorized());
    }
}
