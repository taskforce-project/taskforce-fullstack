package com.taskforce.tf_api.core.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web — {@link ClientLogController} (journalisation des erreurs client, E25).
 * Contrat : 200 authentifié, 401 sans jeton, 400 si {@code message} vide (validation).
 */
@WebMvcTest(ClientLogController.class)
@Import({SecurityConfig.class, JwtIdentityResolver.class})
@ActiveProfiles("test")
@DisplayName("ClientLogController (@WebMvcTest)")
class ClientLogControllerWebMvcTest {

    private static final String URL = "/api/logs/client";

    @Autowired private MockMvc mockMvc;

    // Requis par WorkspaceAccessInterceptor (WebMvcConfig) chargé dans la tranche web.
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;
    @MockitoBean private UserRepository userRepository;

    @Test
    @DisplayName("journalise une erreur client authentifiée -> 200")
    void should_log_authenticated() throws Exception {
        mockMvc.perform(post(URL)
                .with(jwt().jwt(b -> b.claim("email", "u@it.dev")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"level\":\"error\",\"message\":\"boom\",\"source\":\"/dashboard\"}"))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("refuse sans authentification -> 401")
    void should_reject_unauthenticated() throws Exception {
        mockMvc.perform(post(URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"level\":\"error\",\"message\":\"boom\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("rejette un message vide -> 400 (@Valid)")
    void should_reject_blank_message() throws Exception {
        mockMvc.perform(post(URL)
                .with(jwt().jwt(b -> b.claim("email", "u@it.dev")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"level\":\"error\",\"message\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
