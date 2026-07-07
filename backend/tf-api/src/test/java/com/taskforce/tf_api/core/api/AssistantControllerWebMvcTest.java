package com.taskforce.tf_api.core.api;

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
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web — {@link AssistantController} (endpoint chat JSON). {@code AgentService} mocké.
 */
@WebMvcTest(AssistantController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("AssistantController (@WebMvcTest)")
class AssistantControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private com.taskforce.tf_api.core.service.agent.AgentService agentService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/assistant";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("POST assistant (Accept JSON) → 200")
    void chat_json_200() throws Exception {
        when(agentService.run(anyString(), anyLong(), anyString())).thenReturn(null);

        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Bonjour\"}"))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST assistant message vide (@NotBlank) → 400")
    void chat_invalid_400() throws Exception {
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST assistant sans JWT → 401")
    void chat_unauthenticated_401() throws Exception {
        mockMvc.perform(post(URL)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST assistant message > 4000 caractères (@Size) → 400")
    void chat_message_too_long_400() throws Exception {
        String tooLong = "x".repeat(4001);
        mockMvc.perform(post(URL).with(auth())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"" + tooLong + "\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST assistant utilisateur introuvable → 404")
    void chat_user_not_found_404() throws Exception {
        // JWT valide mais aucun utilisateur en DB → resolveUserId lève ResourceNotFoundException
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());

        mockMvc.perform(post(URL)
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Bonjour\"}"))
            .andExpect(status().isNotFound());
    }
}
