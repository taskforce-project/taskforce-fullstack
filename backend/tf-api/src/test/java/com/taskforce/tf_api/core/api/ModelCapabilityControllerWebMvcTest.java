package com.taskforce.tf_api.core.api;

import java.time.LocalDateTime;
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

import com.taskforce.tf_api.core.dto.response.ModelCapabilityResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.agent.ModelCapabilityService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tests de tranche web : {@link ModelCapabilityController} (la table, une mesure, le choix), le service mocké. */
@WebMvcTest(ModelCapabilityController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("ModelCapabilityController (@WebMvcTest)")
class ModelCapabilityControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ModelCapabilityService capabilities;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/ai/models";
    private static final ModelCapabilityResponse TABLE = new ModelCapabilityResponse("OLLAMA", "qwen3:8b", null, "qwen3:8b", 1,
        List.of(), List.of(), List.of(), List.of(), null);

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET : la table de l'instance pour la personne")
    void table_200() throws Exception {
        when(capabilities.table("acme", 7L)).thenReturn(TABLE);

        mockMvc.perform(get(URL).with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.provider").value("OLLAMA"))
            .andExpect(jsonPath("$.data.current").value("qwen3:8b"));
    }

    @Test
    @DisplayName("POST runs puis un cas : la mesure s'ouvre sur le modèle nommé, chaque cas se note à part")
    void measure_200() throws Exception {
        var a = auth();
        when(capabilities.start("acme", 7L, "qwen3:14b")).thenReturn(
            new ModelCapabilityResponse.RunStarted(9L, "qwen3:14b", LocalDateTime.of(2026, 11, 4, 10, 0), List.of("tools-move")));
        when(capabilities.measure("acme", 7L, 9L, "tools-move")).thenReturn(
            new ModelCapabilityResponse.CaseResult("tools-move", "tools", true, List.of(), List.of(), "Done.", "qwen3:14b", 5347, false));

        mockMvc.perform(post(URL + "/runs").with(a).contentType(MediaType.APPLICATION_JSON).content("{\"model\":\"qwen3:14b\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.runId").value(9))
            .andExpect(jsonPath("$.data.cases[0]").value("tools-move"));
        mockMvc.perform(post(URL + "/runs/9/cases/tools-move").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.passed").value(true))
            .andExpect(jsonPath("$.data.promptTokens").value(5347));
    }

    @Test
    @DisplayName("PUT choice : le modèle de Cortex pour la personne ; un nom trop long est refusé")
    void choice() throws Exception {
        var a = auth();
        when(capabilities.choose(any(), any(), any())).thenReturn(TABLE);

        mockMvc.perform(put(URL + "/choice").with(a).contentType(MediaType.APPLICATION_JSON).content("{\"model\":null}"))
            .andExpect(status().isOk());
        verify(capabilities).choose("acme", 7L, null);
        mockMvc.perform(put(URL + "/choice").with(a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"model\":\"" + "x".repeat(129) + "\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("sans jeton : 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
    }
}
