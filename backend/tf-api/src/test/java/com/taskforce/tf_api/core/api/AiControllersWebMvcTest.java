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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
    @MockitoBean private com.taskforce.tf_api.core.service.agent.AgentService agentService;
    @MockitoBean private com.taskforce.tf_api.core.service.agent.ModelCapabilityService modelCapabilityService;
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
    @DisplayName("GET brain overview → 200")
    void knowledge_gets_200() throws Exception {
        when(knowledgeService.getOverview(anyString(), anyLong())).thenReturn(null);

        mockMvc.perform(get("/api/workspaces/acme/brain").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET une note → 200, pour la lire dans le volet")
    void knowledge_node_200() throws Exception {
        when(knowledgeService.getNode(eq("acme"), eq(5L), anyLong()))
            .thenReturn(com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse.builder().id(5L).title("Runbook").build());

        mockMvc.perform(get("/api/workspaces/acme/brain/nodes/5").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.title").value("Runbook"));
    }

    @Test
    @DisplayName("POST brain/search : textOnly passe par le plein texte, sans lui la recherche habituelle")
    void knowledge_search_text_only() throws Exception {
        when(brainSearchService.searchText(eq("acme"), anyLong(), eq("deploy"), eq(6))).thenReturn(List.of());

        mockMvc.perform(post("/api/workspaces/acme/brain/search").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"query\":\"deploy\",\"topK\":6,\"textOnly\":true}"))
            .andExpect(status().isOk());
        org.mockito.Mockito.verify(brainSearchService).searchText(eq("acme"), anyLong(), eq("deploy"), eq(6));

        mockMvc.perform(post("/api/workspaces/acme/brain/search").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"query\":\"deploy\"}"))
            .andExpect(status().isOk());
        org.mockito.Mockito.verify(brainSearchService).search(eq("acme"), anyLong(), eq("deploy"), org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.isNull());
    }

    @Test
    @DisplayName("GET analysis workflows → 200")
    void analysis_list_200() throws Exception {
        when(analysisJobService.list(anyString(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/analysis").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST compact : condense maintenant, avec le modèle que la personne a choisi")
    void conversations_compact_200() throws Exception {
        com.taskforce.tf_api.core.model.User user = com.taskforce.tf_api.core.model.User.builder().id(7L).build();
        com.taskforce.tf_api.core.model.Workspace workspace = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").build();
        when(userRepository.findByEmail(any())).thenReturn(java.util.Optional.of(user));
        when(brainAccessGuard.resolveAndAuthorize(eq("acme"), anyLong())).thenReturn(workspace);
        when(modelCapabilityService.chosenModel(7L)).thenReturn("qwen3:14b");
        java.util.concurrent.atomic.AtomicReference<String> model = new java.util.concurrent.atomic.AtomicReference<>();
        when(aiConversationService.compact(5L, 7L)).thenAnswer(call -> {
            model.set(com.taskforce.tf_api.core.service.ai.ChosenModel.current().orElse(null));
            return new com.taskforce.tf_api.core.dto.response.ConversationDtos.Compaction(12, "A summary.", 900, 0, 16_384, false);
        });
        when(agentService.baselineTokens()).thenReturn(3_100);

        mockMvc.perform(post("/api/workspaces/acme/ai/conversations/5/compact").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.summarized").value(12))
            .andExpect(jsonPath("$.data.summary").value("A summary."))
            .andExpect(jsonPath("$.data.contextTokens").value(4_000))
            .andExpect(jsonPath("$.data.contextWindow").value(16_384));
        org.assertj.core.api.Assertions.assertThat(model.get()).isEqualTo("qwen3:14b");
    }

    @org.junit.jupiter.params.ParameterizedTest(name = "{0}")
    @org.junit.jupiter.params.provider.CsvSource(delimiter = '|', value = {
        "{\"projectId\":12}   | 12",
        "{\"projectId\":null} | ",
    })
    @DisplayName("PUT project : la conversation travaille dans ce projet, ou dans aucun (R135)")
    void conversations_set_project_200(String body, Long projectId) throws Exception {
        com.taskforce.tf_api.core.model.User user = com.taskforce.tf_api.core.model.User.builder().id(7L).build();
        com.taskforce.tf_api.core.model.Workspace workspace = com.taskforce.tf_api.core.model.Workspace.builder().id(1L).slug("acme").build();
        when(userRepository.findByEmail(any())).thenReturn(java.util.Optional.of(user));
        when(brainAccessGuard.resolveAndAuthorize(eq("acme"), anyLong())).thenReturn(workspace);
        when(aiConversationService.setProject(5L, 7L, 1L, projectId)).thenReturn(
            new com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationSummary(5L, "t", null, 2, 0, projectId));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/workspaces/acme/ai/conversations/5/project")
                .with(auth()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(5));
    }

    @Test
    @DisplayName("PUT project invalide (@Positive) → 400")
    void conversations_set_invalid_project_400() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/workspaces/acme/ai/conversations/5/project")
                .with(auth()).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"projectId\":-1}"))
            .andExpect(status().isBadRequest());
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
