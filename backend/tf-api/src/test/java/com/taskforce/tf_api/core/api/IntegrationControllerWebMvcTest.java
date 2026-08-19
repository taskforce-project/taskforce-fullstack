package com.taskforce.tf_api.core.api;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.GitHubIssueResponse;
import com.taskforce.tf_api.core.dto.response.GitHubLinkResponse;
import com.taskforce.tf_api.core.dto.response.SlackChannelResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.GitHubIntegrationService;
import com.taskforce.tf_api.core.service.PlanFeatureService;
import com.taskforce.tf_api.core.service.PlaneIntegrationService;
import com.taskforce.tf_api.core.service.SlackIntegrationService;
import com.taskforce.tf_api.core.service.integration.ConnectorConnectionService;
import com.taskforce.tf_api.core.service.integration.IntegrationCatalogService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
    @MockitoBean private PlaneIntegrationService planeService;
    @MockitoBean private IntegrationCatalogService catalogService;
    @MockitoBean private ConnectorConnectionService connectorConnectionService;
    @MockitoBean private PlanFeatureService planFeatureService;
    @MockitoBean private AuthorizationService authorizationService;

    @BeforeEach
    void stubResolution() {
        // requireManager résout ws + user ; la vérif de rôle (AuthorizationService) est mockée (no-op par défaut).
        lenient().when(workspaceRepository.findBySlug(anyString()))
            .thenReturn(Optional.of(Workspace.builder().id(1L).slug("acme").build()));
        lenient().when(userRepository.findByEmail(anyString()))
            .thenReturn(Optional.of(User.builder().id(3L).email("dev@it.dev").build()));
        // WorkspaceAccessInterceptor : membre du workspace (sinon 403 avant d'atteindre le contrôleur).
        lenient().when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(anyLong(), anyLong()))
            .thenReturn(true);
    }

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
    @DisplayName("DELETE github (disconnect) par un non-gestionnaire (MEMBER) → 403")
    void disconnect_forbidden_for_non_manager() throws Exception {
        doThrow(new ForbiddenException("Permission insuffisante pour cette action"))
            .when(authorizationService).requireManager(anyLong(), anyLong());

        mockMvc.perform(delete("/api/workspaces/acme/integrations/github").with(auth()))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET github/status sans JWT → 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/integrations/github/status")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------
    // GitHub — connect (redirect), issues, links
    // ------------------------------------------------------------------

    @Test
    @DisplayName("GET github/connect → 200 + authorizeUrl (JSON, XHR authentifié)")
    void github_connect_url() throws Exception {
        when(userRepository.findByEmail(anyString()))
            .thenReturn(Optional.of(User.builder().id(3L).email("dev@it.dev").build()));
        when(gitHubService.buildAuthorizeUrl(anyString(), any()))
            .thenReturn(java.net.URI.create("https://github.com/login/oauth/authorize?state=xyz"));

        mockMvc.perform(get("/api/workspaces/acme/integrations/github/connect").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.authorizeUrl").value("https://github.com/login/oauth/authorize?state=xyz"));
    }

    @Test
    @DisplayName("GET github/issues (?repo=) → 200")
    void github_issues_200() throws Exception {
        when(gitHubService.listRepoIssues(anyString(), anyString())).thenReturn(java.util.List.<GitHubIssueResponse>of());

        mockMvc.perform(get("/api/workspaces/acme/integrations/github/issues")
                .param("repo", "octo/hello").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("POST github issue links valide → 201")
    void github_add_link_201() throws Exception {
        when(userRepository.findByEmail(anyString()))
            .thenReturn(Optional.of(User.builder().id(3L).email("dev@it.dev").build()));
        when(gitHubService.addLink(anyLong(), any(), any())).thenReturn(
            new GitHubLinkResponse(1L, "PR", "octo/hello", 42, "https://pr", null, null, "T", "OPEN", null));

        mockMvc.perform(post("/api/workspaces/acme/integrations/github/issues/5/links").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"linkType\":\"PR\",\"repoFullName\":\"octo/hello\",\"prNumber\":42,\"prUrl\":\"https://pr\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.linkType").value("PR"));
    }

    @Test
    @DisplayName("POST github issue links linkType invalide (@Pattern) → 400")
    void github_add_link_invalid_400() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/integrations/github/issues/5/links").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"linkType\":\"TAG\",\"repoFullName\":\"octo/hello\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET github issue links → 200")
    void github_get_links_200() throws Exception {
        when(gitHubService.getLinks(anyLong())).thenReturn(java.util.List.<GitHubLinkResponse>of());

        mockMvc.perform(get("/api/workspaces/acme/integrations/github/issues/5/links").with(auth()))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("DELETE github link → 200")
    void github_delete_link_200() throws Exception {
        mockMvc.perform(delete("/api/workspaces/acme/integrations/github/links/9").with(auth()))
            .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------
    // Slack — connect (redirect), disconnect, channels
    // ------------------------------------------------------------------

    @Test
    @DisplayName("GET slack/connect → 200 + authorizeUrl (JSON, XHR authentifié)")
    void slack_connect_url() throws Exception {
        when(userRepository.findByEmail(anyString()))
            .thenReturn(Optional.of(User.builder().id(3L).email("dev@it.dev").build()));
        when(slackService.buildAuthorizeUrl(anyString(), any()))
            .thenReturn(java.net.URI.create("https://slack.com/oauth/v2/authorize?state=xyz"));

        mockMvc.perform(get("/api/workspaces/acme/integrations/slack/connect").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.authorizeUrl").value("https://slack.com/oauth/v2/authorize?state=xyz"));
    }

    @Test
    @DisplayName("DELETE slack (disconnect) → 200")
    void slack_disconnect_200() throws Exception {
        mockMvc.perform(delete("/api/workspaces/acme/integrations/slack").with(auth()))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST slack channels valide → 201")
    void slack_add_channel_201() throws Exception {
        when(slackService.addChannel(anyString(), any())).thenReturn(
            new SlackChannelResponse(1L, "C123", "général", java.util.List.of(), true, null));

        mockMvc.perform(post("/api/workspaces/acme/integrations/slack/channels").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"channelId\":\"C123\",\"channelName\":\"général\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.channelId").value("C123"));
    }

    @Test
    @DisplayName("POST slack channels channelId manquant (@NotBlank) → 400")
    void slack_add_channel_invalid_400() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/integrations/slack/channels").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"channelName\":\"général\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET slack channels → 200")
    void slack_get_channels_200() throws Exception {
        when(slackService.getChannels(anyString())).thenReturn(java.util.List.<SlackChannelResponse>of());

        mockMvc.perform(get("/api/workspaces/acme/integrations/slack/channels").with(auth()))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("DELETE slack channel → 200")
    void slack_delete_channel_200() throws Exception {
        mockMvc.perform(delete("/api/workspaces/acme/integrations/slack/channels/4").with(auth()))
            .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------
    // Callbacks publics (pas de JWT requis)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("GET github/callback public → 302")
    void github_callback_302() throws Exception {
        when(gitHubService.handleCallback(anyString(), anyString()))
            .thenReturn("http://localhost:3000/acme/settings?github=connected");

        mockMvc.perform(get("/api/integrations/github/callback").param("code", "c").param("state", "acme"))
            .andExpect(status().isFound());
    }

    @Test
    @DisplayName("GET slack/callback public → 302")
    void slack_callback_302() throws Exception {
        when(slackService.handleCallback(anyString(), anyString()))
            .thenReturn("http://localhost:3000/acme/settings?slack=connected");

        mockMvc.perform(get("/api/integrations/slack/callback").param("code", "c").param("state", "acme"))
            .andExpect(status().isFound());
    }
}
