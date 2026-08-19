package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AiConversationService;
import com.taskforce.tf_api.core.service.AnalyticsService;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.agent.AnalysisJobRunner;
import com.taskforce.tf_api.core.service.agent.AnalysisJobService;
import com.taskforce.tf_api.core.service.agent.ChartSpecService;
import com.taskforce.tf_api.core.service.agent.SavedChartService;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web des controllers IA / analytics (Analytics, Knowledge/Brain, Analysis, Cortex).
 * Services mockés — on vérifie le routage, la résolution d'identité (JWT → userId) et le code
 * 200/401 ; la logique métier est couverte par les *ServiceTest dédiés. Comme les autres slices,
 * on n'importe que {@link SecurityConfig} : le WorkspaceAccessInterceptor n'est donc pas actif,
 * exactement comme dans MiscControllersWebMvcTest.
 */
@WebMvcTest({AnalyticsController.class, KnowledgeController.class,
             AnalysisController.class, AiConversationController.class})
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("Controllers IA / analytics (@WebMvcTest)")
class AiControllersWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private AnalyticsService analyticsService;
    @MockitoBean private ChartSpecService chartSpecService;
    @MockitoBean private SavedChartService savedChartService;
    @MockitoBean private KnowledgeService knowledgeService;
    @MockitoBean private BrainSearchService brainSearchService;
    @MockitoBean private AnalysisJobService analysisJobService;
    @MockitoBean private AnalysisJobRunner analysisJobRunner;
    @MockitoBean private AiConversationService aiConversationService;
    @MockitoBean private BrainAccessGuard brainAccessGuard;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private JwtIdentityResolver identityResolver;
    // Requis pour instancier WorkspaceAccessInterceptor (WebMvcConfig est chargé dans la slice) ;
    // non stubbés → findBySlug renvoie Optional.empty() → l'intercepteur laisse passer (fail-open).
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";

    private RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        when(identityResolver.resolveEmail(any())).thenReturn(EMAIL);
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET analytics KPIs / workload → 200")
    void analytics_gets_200() throws Exception {
        when(analyticsService.getKpis(anyString(), anyLong(), any())).thenReturn(null);
        when(analyticsService.getWorkload(anyString(), anyLong(), any())).thenReturn(null);

        mockMvc.perform(get("/api/workspaces/acme/analytics/kpis").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/analytics/workload").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET brain overview / nodes → 200")
    void knowledge_gets_200() throws Exception {
        when(knowledgeService.getOverview(anyString(), anyLong())).thenReturn(null);
        when(knowledgeService.listNodes(anyString(), anyLong(), any())).thenReturn(List.of());

        mockMvc.perform(get("/api/workspaces/acme/brain").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get("/api/workspaces/acme/brain/nodes").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET analysis workflows → 200")
    void analysis_list_200() throws Exception {
        when(analysisJobService.list(anyString(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/analysis").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET Cortex conversations → 200")
    void conversations_list_200() throws Exception {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(1L);
        when(brainAccessGuard.resolveAndAuthorize(anyString(), anyLong())).thenReturn(ws);
        when(aiConversationService.list(anyLong(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/ai/conversations").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET analytics sans JWT → 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/analytics/kpis")).andExpect(status().isUnauthorized());
    }
}
