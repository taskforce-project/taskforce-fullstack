package com.taskforce.tf_api.core.api;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.config.PersonalTokenScopeFilterConfig;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.security.PersonalTokenAuthenticator;
import com.taskforce.tf_api.core.security.PersonalTokenScopeFilter;
import com.taskforce.tf_api.core.service.PersonalAccessTokenService;
import com.taskforce.tf_api.core.service.PersonalAccessTokenService.TokenPrincipal;
import com.taskforce.tf_api.core.service.mcpserver.McpServerService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web du serveur MCP de l'instance (OSS-5.2) avec l'authentification par jeton personnel (OSS-5.1) branchée
 * comme en production : un jeton personnel n'ouvre que cette route.
 */
@WebMvcTest(McpServerController.class)
@Import({SecurityConfig.class, PersonalTokenAuthenticator.class, PersonalTokenScopeFilter.class,
    PersonalTokenScopeFilterConfig.class})
@ActiveProfiles("test")
@DisplayName("McpServerController (@WebMvcTest)")
class McpServerControllerWebMvcTest {

    private static final String TOKEN = "tfp_" + "k".repeat(43);
    private static final String INITIALIZE = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}";

    @Autowired private MockMvc mockMvc;

    @MockitoBean private McpServerService mcpServerService;
    @MockitoBean private PersonalAccessTokenService tokenService;
    @MockitoBean private UserRepository userRepository;                       // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    @Test
    @DisplayName("jeton personnel : la requête arrive au serveur MCP au nom de la personne")
    void personal_token_reaches_the_mcp_server_as_the_person() throws Exception {
        when(tokenService.authenticate(TOKEN)).thenReturn(Optional.of(new TokenPrincipal(3L, 7L, "ada@taskforce.dev", "kc-7")));
        when(mcpServerService.reply(eq("acme"), any(Jwt.class), anyString()))
            .thenReturn(new McpServerService.Reply(200, "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}"));

        mockMvc.perform(post("/api/workspaces/acme/mcp").header("Authorization", "Bearer " + TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content(INITIALIZE))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.jsonrpc").value("2.0"));

        ArgumentCaptor<Jwt> principal = ArgumentCaptor.forClass(Jwt.class);
        verify(mcpServerService).reply(eq("acme"), principal.capture(), eq(INITIALIZE));
        assertThat(principal.getValue().getClaimAsString("email")).isEqualTo("ada@taskforce.dev");
        assertThat(principal.getValue().hasClaim(PersonalTokenAuthenticator.TOKEN_CLAIM)).isTrue();
        assertThat(principal.getValue().getTokenValue()).doesNotContain(TOKEN.substring(4));
    }

    @ParameterizedTest(name = "jeton personnel refusé hors du serveur MCP : {0}")
    @ValueSource(strings = {"/api/users/me/tokens", "/api/workspaces/acme/projects", "/api/workspaces/acme/mcp/servers",
        "/api/workspaces", "/api/delivery/runners"})
    void personal_token_is_refused_anywhere_else(String path) throws Exception {
        when(tokenService.authenticate(TOKEN)).thenReturn(Optional.of(new TokenPrincipal(3L, 7L, "ada@taskforce.dev", "kc-7")));

        mockMvc.perform(get(path).header("Authorization", "Bearer " + TOKEN))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value("Access denied: personal access tokens only work with the MCP server"));
    }

    @Test
    @DisplayName("jeton personnel inconnu, révoqué ou expiré : 401, rien n'est traité")
    void unknown_personal_token_is_unauthorized() throws Exception {
        when(tokenService.authenticate(anyString())).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/workspaces/acme/mcp").header("Authorization", "Bearer " + TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content(INITIALIZE))
            .andExpect(status().isUnauthorized());
        verify(mcpServerService, never()).reply(anyString(), any(), any());
    }

    @Test
    @DisplayName("sans jeton : 401")
    void anonymous_is_unauthorized() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/mcp").contentType(MediaType.APPLICATION_JSON).content(INITIALIZE))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("notification : 202 sans corps")
    void notification_is_accepted_without_body() throws Exception {
        when(mcpServerService.reply(eq("acme"), any(Jwt.class), anyString())).thenReturn(new McpServerService.Reply(202, null));

        mockMvc.perform(post("/api/workspaces/acme/mcp").with(user())
                .contentType(MediaType.APPLICATION_JSON).content("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}"))
            .andExpect(status().isAccepted());
    }

    @Test
    @DisplayName("erreur de protocole : statut et corps JSON du service, tels quels")
    void protocol_errors_keep_their_status_and_body() throws Exception {
        when(mcpServerService.reply(eq("acme"), any(Jwt.class), anyString()))
            .thenReturn(new McpServerService.Reply(400, "{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32700,\"message\":\"Parse error\"}}"));

        mockMvc.perform(post("/api/workspaces/acme/mcp").with(user()).contentType(MediaType.APPLICATION_JSON).content("not json"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value(-32700));
    }

    @Test
    @DisplayName("GET et DELETE : 405, serveur sans flux SSE ni session")
    void get_and_delete_are_not_allowed() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/mcp").with(user()))
            .andExpect(status().isMethodNotAllowed())
            .andExpect(header().string("Allow", "POST"));
        mockMvc.perform(delete("/api/workspaces/acme/mcp").with(user()))
            .andExpect(status().isMethodNotAllowed());
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor user() {
        return jwt().jwt(b -> b.claim("email", "ada@taskforce.dev"));
    }
}
