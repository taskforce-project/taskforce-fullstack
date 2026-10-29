package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.EvalBankResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.agent.EvalService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tests de tranche web : {@link EvalController}, la banque d'évaluations de Cortex. {@code EvalService} mocké. */
@WebMvcTest(EvalController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("EvalController (@WebMvcTest)")
class EvalControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private EvalService evalService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/evals";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET evals : la banque, son interrupteur et ses cas")
    void bank_200() throws Exception {
        when(evalService.bank("acme", 7L)).thenReturn(new EvalBankResponse(true, false, List.of(), List.of()));

        mockMvc.perform(get(URL).with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.enabled").value(true))
            .andExpect(jsonPath("$.data.canManage").value(false));
    }

    @Test
    @DisplayName("POST runs/{run}/cases/{case} : la note d'un cas")
    void run_case_200() throws Exception {
        when(evalService.runCase("acme", 7L, 9L, 40L)).thenReturn(
            new EvalBankResponse.Result(40L, "Kernel check", true, List.of(), List.of(), "Proposed.", "llama3.2"));

        mockMvc.perform(post(URL + "/runs/9/cases/40").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.passed").value(true))
            .andExpect(jsonPath("$.data.model").value("llama3.2"));
    }

    @ParameterizedTest(name = "{0} {1} → 400")
    @CsvSource(delimiter = '|', value = {
        "POST | /cases       | {\"record\":\"00000000-0000-0000-0000-0000000000bb\"}", // sans critères
        "POST | /cases/draft | {}",                                                   // sans dossier
        "PUT  | /settings    | {}",                                                   // sans valeur
    })
    void invalid_body_400(String method, String path, String body) throws Exception {
        var request = "PUT".equals(method) ? put(URL + path) : post(URL + path);
        mockMvc.perform(request.with(auth()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
        verify(evalService, never()).create(any(), any(), any(), any(), any());
        verify(evalService, never()).draft(any(), any(), any());
        verify(evalService, never()).setEnabled(any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("sans jeton : 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
    }

}
