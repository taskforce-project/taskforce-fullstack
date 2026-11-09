package com.taskforce.tf_api.core.api;

import java.time.LocalDate;
import java.time.LocalDateTime;
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
import com.taskforce.tf_api.core.dto.response.EvalHistoryResponse;
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

    private static EvalBankResponse.CaseSummary kept(boolean waiting) {
        LocalDateTime at = LocalDateTime.of(2026, 11, 9, 10, 0);
        return new EvalBankResponse.CaseSummary(40L, "Case", "Question", "", at, at, true, waiting ? "Ask first." : "", waiting);
    }

    @Test
    @DisplayName("POST cases/good : ce qui a été observé devient ce qu'on attend, d'un clic")
    void good_200() throws Exception {
        when(evalService.keepGood("acme", 7L, "r-1")).thenReturn(kept(false));

        mockMvc.perform(post(URL + "/cases/good").with(auth()).contentType(MediaType.APPLICATION_JSON).content("{\"record\":\"r-1\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.waiting").value(false));
    }

    @Test
    @DisplayName("POST cases/bad : une phrase, et le cas attend ses critères")
    void bad_200() throws Exception {
        when(evalService.keepBad("acme", 7L, "r-1", "Ask first.")).thenReturn(kept(true));

        mockMvc.perform(post(URL + "/cases/bad").with(auth()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"record\":\"r-1\",\"expected\":\"Ask first.\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.waiting").value(true))
            .andExpect(jsonPath("$.data.expected").value("Ask first."));
    }

    @org.junit.jupiter.params.ParameterizedTest(name = "{0}")
    @org.junit.jupiter.params.provider.ValueSource(strings = {"{\"record\":\"r-1\"}", "{\"record\":\"r-1\",\"expected\":\"  \"}"})
    void bad_needs_its_sentence_400(String body) throws Exception {
        mockMvc.perform(post(URL + "/cases/bad").with(auth()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PUT cases/{id}/criteria : les critères d'un cas qui les attend")
    void criteria_200() throws Exception {
        when(evalService.giveCriteria(org.mockito.ArgumentMatchers.eq("acme"), org.mockito.ArgumentMatchers.eq(7L), org.mockito.ArgumentMatchers.eq(40L),
                org.mockito.ArgumentMatchers.eq("Case"), org.mockito.ArgumentMatchers.any())).thenReturn(kept(false));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(URL + "/cases/40/criteria").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Case\",\"criteria\":{\"tool\":\"none\"}}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(40));
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
    @DisplayName("GET evals/history : les rejeux par modèle et par date, et chaque cas avec son origine")
    void history_200() throws Exception {
        when(evalService.history("acme", 7L)).thenReturn(new EvalHistoryResponse(
            List.of(new EvalHistoryResponse.Run(9L, "default", "qwen3:8b", LocalDateTime.of(2026, 11, 7, 10, 0),
                LocalDateTime.of(2026, 11, 7, 10, 4), 6, 6, 4)),
            List.of(new EvalHistoryResponse.Case(40L, "R118 4/6: delete TESTTA-2", "suprime testta 2",
                LocalDate.of(2026, 11, 2), LocalDateTime.of(2026, 11, 2, 15, 8), true,
                new EvalHistoryResponse.Origin("incident", List.of("I deleted TESTTA-2."), "Nothing was deleted."),
                List.of(new EvalHistoryResponse.Grade(9L, true))))));

        mockMvc.perform(get(URL + "/history").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.runs[0].answeredBy").value("qwen3:8b"))
            .andExpect(jsonPath("$.data.runs[0].graded").value(6))
            .andExpect(jsonPath("$.data.cases[0].origin.kind").value("incident"))
            .andExpect(jsonPath("$.data.cases[0].grades[0].passed").value(true));
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
