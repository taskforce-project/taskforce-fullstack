package com.taskforce.tf_api.core.api;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.config.DeliverySessionFilterConfig;
import com.taskforce.tf_api.core.dto.response.RunnerApprovalResponse;
import com.taskforce.tf_api.core.dto.response.RunnerClaimResponse;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.security.DeliverySessionFilter;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerService;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentity;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web des endpoints machine du runner local (ADR-013), filtre de session déléguée branché comme
 * en production. Contrat HTTP + règle d'accès : un jeton de runner, jamais un jeton d'utilisateur.
 */
@WebMvcTest(DeliveryRunnerController.class)
@Import({SecurityConfig.class, LocalRunnerSettings.class, RunnerIdentityResolver.class,
    DeliverySessionFilter.class, DeliverySessionFilterConfig.class})
@TestPropertySource(properties = "delivery.local-runner.enabled=true")
@ActiveProfiles("test")
@DisplayName("DeliveryRunnerController (@WebMvcTest)")
class DeliveryRunnerControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private LocalRunnerService localRunnerService;
    @MockitoBean private UserRepository userRepository;                       // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static RequestPostProcessor runner() {
        return jwt().jwt(b -> b
            .claim("azp", "tf-runner-pierre")
            .claim("preferred_username", "service-account-tf-runner-pierre")
            .claim("realm_access", Map.of("roles", List.of("delivery-runner")))
            .claim("tf_runner_owner", "pierre@taskforce.dev"));
    }

    private static RequestPostProcessor user() {
        return jwt().jwt(b -> b.claim("azp", "taskforce-api").claim("email", "dev@it.dev"));
    }

    @Test
    @DisplayName("POST /claim : un runner reçoit le brief du run réclamé")
    void claim_returns_brief() throws Exception {
        when(localRunnerService.claim(new RunnerIdentity("tf-runner-pierre", "pierre@taskforce.dev")))
            .thenReturn(Optional.of(new RunnerClaimResponse(100L, 55L, "WEB-4", "Fix the footer", "Details",
                12L, "Website", "acme", "acme/website", "claude-sonnet-5", LocalDateTime.now().plusHours(2), null, "npm test")));

        mockMvc.perform(post("/api/delivery/runner/claim").with(runner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.runId").value(100))
            .andExpect(jsonPath("$.data.issueKey").value("WEB-4"))
            .andExpect(jsonPath("$.data.workspaceSlug").value("acme"))
            .andExpect(jsonPath("$.data.repoFullName").value("acme/website"))
            .andExpect(jsonPath("$.data.testCommand").value("npm test"));
    }

    @Test
    @DisplayName("POST /claim : file vide -> 200 avec data null")
    void claim_empty() throws Exception {
        when(localRunnerService.claim(any())).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/delivery/runner/claim").with(runner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data").doesNotExist());
    }

    @ParameterizedTest(name = "jeton d'utilisateur refusé (403) : POST {0}")
    @ValueSource(strings = {
        "/api/delivery/runner/claim",
        "/api/delivery/runner/runs/100/heartbeat",
    })
    void user_token_is_forbidden(String path) throws Exception {
        mockMvc.perform(post(path).with(user()))
            .andExpect(status().isForbidden());

        verify(localRunnerService, never()).claim(any());
        verify(localRunnerService, never()).heartbeat(any(), any());
    }

    @Test
    @DisplayName("sans jeton : 401")
    void anonymous_is_unauthorized() throws Exception {
        mockMvc.perform(post("/api/delivery/runner/claim"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /result : résultat DONE transmis au service")
    void result_done() throws Exception {
        mockMvc.perform(post("/api/delivery/runner/runs/100/result").with(runner())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DONE\",\"summary\":\"PR opened\",\"resultUrl\":\"https://github.com/acme/website/pull/9\"}"))
            .andExpect(status().isOk());

        verify(localRunnerService).complete(eq(100L), any(RunnerIdentity.class), any());
    }

    @ParameterizedTest(name = "POST /result : corps invalide refusé (400) : {0}")
    @ValueSource(strings = {
        "{\"status\":\"MERGED\",\"summary\":\"x\"}",
        "{\"summary\":\"x\"}",
        "{\"status\":\"DONE\",\"summary\":\"x\",\"resultUrl\":\"javascript:alert(1)\"}",
        "{\"status\":\"DONE\",\"summary\":\"x\",\"resultUrl\":\"ftp://host/file\"}",
    })
    void result_rejects_invalid_body(String body) throws Exception {
        mockMvc.perform(post("/api/delivery/runner/runs/100/result").with(runner())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());

        verify(localRunnerService, never()).complete(any(), any(), any());
    }

    @Test
    @DisplayName("un runner hors de ses endpoints et sans session : 403 (jamais traité comme un utilisateur)")
    void runner_outside_its_api_is_forbidden() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/projects/12/issues").with(runner())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /events : la chronologie du run est transmise au service")
    void events_are_saved() throws Exception {
        mockMvc.perform(post("/api/delivery/runner/runs/100/events").with(runner())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"events\":[{\"kind\":\"tool\",\"tool\":\"Bash\",\"text\":\"npm test\"}]}"))
            .andExpect(status().isOk());

        verify(localRunnerService).appendEvents(eq(100L), any(RunnerIdentity.class), any());
    }

    @ParameterizedTest(name = "POST /events : corps invalide refusé (400) : {0}")
    @ValueSource(strings = {
        "{\"events\":[]}",
        "{\"events\":[{\"kind\":\"shell\",\"text\":\"x\"}]}",
        "{\"events\":[{\"kind\":\"text\"}]}",
    })
    void events_reject_invalid_body(String body) throws Exception {
        mockMvc.perform(post("/api/delivery/runner/runs/100/events").with(runner())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());

        verify(localRunnerService, never()).appendEvents(any(), any(), any());
    }

    @Test
    @DisplayName("validations : le runner ouvre une demande puis lit la décision")
    void approvals_round_trip() throws Exception {
        LocalDateTime expires = LocalDateTime.now().plusMinutes(10);
        when(localRunnerService.requestApproval(eq(100L), any(RunnerIdentity.class), any()))
            .thenReturn(new RunnerApprovalResponse(9L, "PENDING", expires));
        when(localRunnerService.approvalStatus(eq(100L), eq(9L), any(RunnerIdentity.class)))
            .thenReturn(new RunnerApprovalResponse(9L, "ALLOWED", expires));

        mockMvc.perform(post("/api/delivery/runner/runs/100/approvals").with(runner())
                .contentType(MediaType.APPLICATION_JSON).content("{\"tool\":\"Bash\",\"summary\":\"npm install lodash\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.approvalId").value(9))
            .andExpect(jsonPath("$.data.status").value("PENDING"));
        mockMvc.perform(get("/api/delivery/runner/runs/100/approvals/9").with(runner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("ALLOWED"));
    }

    @Test
    @DisplayName("validations : un utilisateur ne peut pas jouer le runner (403)")
    void approvals_refuse_a_user_token() throws Exception {
        mockMvc.perform(post("/api/delivery/runner/runs/100/approvals").with(user())
                .contentType(MediaType.APPLICATION_JSON).content("{\"tool\":\"Bash\",\"summary\":\"x\"}"))
            .andExpect(status().isForbidden());

        verify(localRunnerService, never()).requestApproval(any(), any(), any());
    }
}
