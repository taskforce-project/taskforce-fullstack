package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.delivery.DeliveryActivityService;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProvider;
import com.taskforce.tf_api.core.service.delivery.DeliveryAgentProviderRegistry;
import com.taskforce.tf_api.core.service.delivery.DeliveryRunner;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web {@link DeliveryController} (TF-AGENT-DELIVERY slice 2) : liste des providers délégables.
 * Registre mocké ; contrat HTTP (200 + forme JSON).
 */
@WebMvcTest(DeliveryController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("DeliveryController (@WebMvcTest)")
class DeliveryControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private DeliveryAgentProviderRegistry registry;
    @MockitoBean private DeliveryService deliveryService;
    @MockitoBean private DeliveryRunner deliveryRunner;
    @MockitoBean private DeliveryActivityService activityService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static final String EMAIL = "dev@it.dev";

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET /delivery/providers → 200 + liste des providers")
    void listProviders_200() throws Exception {
        var a = auth();
        DeliveryAgentProvider p = Mockito.mock(DeliveryAgentProvider.class);
        when(p.key()).thenReturn("claude-code");
        when(p.displayName()).thenReturn("Claude Code");
        when(p.logoKey()).thenReturn("claude");
        when(p.available()).thenReturn(false);
        when(p.models()).thenReturn(List.of("claude-opus"));
        when(registry.all()).thenReturn(List.of(p));

        mockMvc.perform(get("/api/workspaces/acme/delivery/providers").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].key").value("claude-code"))
            .andExpect(jsonPath("$.data[0].displayName").value("Claude Code"))
            .andExpect(jsonPath("$.data[0].available").value(false));
    }

    @Test
    @DisplayName("POST /delivery/issues/{id}/delegate → 200 + run (QUEUED)")
    void delegate_200() throws Exception {
        var a = auth();
        var run = new DeliveryRunResponse(1L, 5L, "WEB-5", "Fix the footer", 12L, "Website", "claude-code", "claude-sonnet-5", "QUEUED",
            null, null, null, 7L, null, null);
        when(deliveryService.delegate(anyString(), anyLong(), anyString(), org.mockito.ArgumentMatchers.any(), anyLong()))
            .thenReturn(run);

        mockMvc.perform(post("/api/workspaces/acme/delivery/issues/5/delegate").with(a)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"providerKey\":\"claude-code\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.providerKey").value("claude-code"))
            .andExpect(jsonPath("$.data.status").value("QUEUED"))
            // De quoi afficher et ouvrir le run hors de sa fiche d'issue (historique, canvas).
            .andExpect(jsonPath("$.data.issueKey").value("WEB-5"))
            .andExpect(jsonPath("$.data.issueTitle").value("Fix the footer"))
            .andExpect(jsonPath("$.data.projectId").value(12));
    }

    @Test
    @DisplayName("GET /delivery/issues/{id}/run → 200 (data null si aucun run)")
    void latestRun_200_empty() throws Exception {
        var a = auth();
        when(deliveryService.latestRun(anyString(), anyLong(), anyLong())).thenReturn(java.util.Optional.empty());

        mockMvc.perform(get("/api/workspaces/acme/delivery/issues/5/run").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    private static DeliveryRunResponse run(long id, String status) {
        return new DeliveryRunResponse(id, 5L, "WEB-5", "Fix the footer", 12L, "Website", "claude-code", "Claude Code",
            status, null, null, null, 7L, null, null);
    }

    @ParameterizedTest(name = "dernier run {0} : relu = {1}")
    @CsvSource({ "RUNNING, true", "QUEUED, true", "DONE, false", "FAILED, false" })
    @DisplayName("GET /delivery/issues/{id}/run : relit un run en cours OU en attente (délégation non réclamée close)")
    void latestRun_refreshes_in_flight_runs(String status, boolean refreshed) throws Exception {
        var a = auth();
        when(deliveryService.latestRun(anyString(), anyLong(), anyLong())).thenReturn(Optional.of(run(9L, status)));

        mockMvc.perform(get("/api/workspaces/acme/delivery/issues/5/run").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value(status));

        verify(deliveryRunner, times(refreshed ? 1 : 0)).refresh(9L);
    }

    @Test
    @DisplayName("GET /delivery/runs : relit les runs en attente, puis recharge la liste")
    void listRuns_refreshes_queued_runs() throws Exception {
        var a = auth();
        when(deliveryService.listRuns(anyString(), anyLong()))
            .thenReturn(List.of(run(1L, "QUEUED"), run(2L, "DONE")))
            .thenReturn(List.of(run(1L, "FAILED"), run(2L, "DONE")));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].status").value("FAILED"));

        verify(deliveryRunner).refresh(1L);
        verify(deliveryRunner, never()).refresh(2L);
        verify(deliveryService, times(2)).listRuns(anyString(), anyLong());
    }

    @Test
    @DisplayName("GET /delivery/runs sans run en attente : une seule lecture, aucune relecture")
    void listRuns_without_queued_reads_once() throws Exception {
        var a = auth();
        when(deliveryService.listRuns(anyString(), anyLong())).thenReturn(List.of(run(2L, "DONE")));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs").with(a))
            .andExpect(status().isOk());

        verify(deliveryRunner, never()).refresh(anyLong());
        verify(deliveryService, times(1)).listRuns(anyString(), anyLong());
    }

    @Test
    @DisplayName("GET /runs/{id}/activity : chronologie après N et demandes du run")
    void activity_200() throws Exception {
        var a = auth();
        when(activityService.activity("acme", 100L, 3, 7L)).thenReturn(new DeliveryRunActivityResponse(
            List.of(new DeliveryRunActivityResponse.Event(4, "tool", "Bash", "npm test", null)),
            List.of(new DeliveryRunActivityResponse.Approval(9L, "Bash", "npm install lodash", "PENDING", null, null, null, null, true))));

        mockMvc.perform(get("/api/workspaces/acme/delivery/runs/100/activity").param("after", "3").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.events[0].seq").value(4))
            .andExpect(jsonPath("$.data.approvals[0].canDecide").value(true));
    }

    @ParameterizedTest(name = "POST approval : {0} -> autorisé={1}")
    @CsvSource({"ALLOW, true", "DENY, false"})
    void decide_200(String decision, boolean allow) throws Exception {
        var a = auth();

        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/approvals/9").with(a)
                .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"" + decision + "\"}"))
            .andExpect(status().isOk());

        verify(activityService).decide("acme", 100L, 9L, allow, 7L);
    }

    @Test
    @DisplayName("POST approval : décision inconnue refusée (400)")
    void decide_rejects_unknown_decision() throws Exception {
        mockMvc.perform(post("/api/workspaces/acme/delivery/runs/100/approvals/9")
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"MAYBE\"}"))
            .andExpect(status().isBadRequest());

        verify(activityService, never()).decide(any(), any(), any(), anyBoolean(), any());
    }
}
