package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.taskforce.tf_api.core.desktop.DesktopAiService;
import com.taskforce.tf_api.core.dto.response.DesktopAiStateResponse;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.GlobalExceptionHandler;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@link DesktopAiController} : la route de la coque, son en-tête, la forme que l'écran de réglages lit. */
@DisplayName("DesktopAiController")
class DesktopAiControllerTest {

    private static final DesktopAiStateResponse STATE = new DesktopAiStateResponse(true, true, List.of("qwen3:8b"),
        List.of("bge-m3:latest"), new DesktopAiStateResponse.Chat("qwen3:8b", "qwen3:4b", true),
        new DesktopAiStateResponse.Embeddings("bge-m3:latest", 1024, true));

    private DesktopAiService service;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(DesktopAiService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new DesktopAiController(service))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    @DisplayName("GET : l'état, à la forme que l'écran lit (model_fast)")
    void state() throws Exception {
        when(service.state("tfsh_x", true)).thenReturn(STATE);

        mockMvc.perform(get("/api/desktop/ai").param("fresh", "true").header(DesktopAiController.SHELL_HEADER, "tfsh_x"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.reachable").value(true))
            .andExpect(jsonPath("$.data.chat.model_fast").value("qwen3:4b"))
            .andExpect(jsonPath("$.data.embedModels[0]").value("bge-m3:latest"))
            .andExpect(jsonPath("$.data.embeddings.dimensions").value(1024));
    }

    @Test
    @DisplayName("PUT : les variables passent au service avec le secret de la coque")
    void apply() throws Exception {
        when(service.apply("tfsh_x", Map.of("AI_PROVIDER", "anthropic", "AI_API_KEY", "sk-ant-1"))).thenReturn(STATE);

        mockMvc.perform(put("/api/desktop/ai").header(DesktopAiController.SHELL_HEADER, "tfsh_x")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variables\":{\"AI_PROVIDER\":\"anthropic\",\"AI_API_KEY\":\"sk-ant-1\"}}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.chat.model").value("qwen3:8b"));
    }

    @Test
    @DisplayName("sans le secret de la coque : 403")
    void withoutTheShellSecret() throws Exception {
        when(service.state(isNull(), anyBoolean())).thenThrow(new ForbiddenException("Only the TaskForce app can change its AI provider"));

        mockMvc.perform(get("/api/desktop/ai")).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("un nom de variable mal formé ou une valeur trop longue : 400, sans appel au service")
    void validatesTheBody() throws Exception {
        mockMvc.perform(put("/api/desktop/ai").header(DesktopAiController.SHELL_HEADER, "tfsh_x")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variables\":{\"ai provider\":\"x\"}}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/desktop/ai").header(DesktopAiController.SHELL_HEADER, "tfsh_x")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variables\":{\"AI_API_KEY\":\"" + "k".repeat(501) + "\"}}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/desktop/ai").header(DesktopAiController.SHELL_HEADER, "tfsh_x")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());

        verify(service, never()).apply(any(), anyMap());
    }
}
