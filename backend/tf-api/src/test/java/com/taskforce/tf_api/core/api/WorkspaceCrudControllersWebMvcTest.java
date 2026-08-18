package com.taskforce.tf_api.core.api;

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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AiUsageService;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.DashboardCardService;
import com.taskforce.tf_api.core.service.MemberLeaveService;
import com.taskforce.tf_api.core.service.MemberSkillProfileService;
import com.taskforce.tf_api.core.service.PageService;
import com.taskforce.tf_api.core.service.SkillSuggestionService;
import com.taskforce.tf_api.core.service.WebhookService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tranche web des controllers CRUD de workspace restés à ~0 % (Cycles, Pages, Dashboard-cards,
 * Congés, Compétences, Usage IA, Webhooks, Suggestions). Services mockés — on vérifie routage,
 * résolution d'identité (JWT→userId) et 200/401. Comme les autres slices, seul `SecurityConfig`
 * est importé ; les repos workspace sont mockés pour instancier `WorkspaceAccessInterceptor`
 * (fail-open → laisse passer).
 */
@WebMvcTest({CycleController.class, PageController.class, DashboardCardController.class,
             MemberLeaveController.class, MemberSkillController.class, AiUsageController.class,
             SkillSuggestionController.class, WebhookController.class})
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("Controllers CRUD workspace (@WebMvcTest)")
class WorkspaceCrudControllersWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private CycleService cycleService;
    @MockitoBean private PageService pageService;
    @MockitoBean private DashboardCardService dashboardCardService;
    @MockitoBean private MemberLeaveService memberLeaveService;
    @MockitoBean private MemberSkillProfileService skillService;
    @MockitoBean private AiUsageService aiUsageService;
    @MockitoBean private SkillSuggestionService suggestionService;
    @MockitoBean private WebhookService webhookService;
    @MockitoBean private JwtIdentityResolver identityResolver; // PageController uniquement
    @MockitoBean private UserRepository userRepository;
    // Requis pour instancier WorkspaceAccessInterceptor (WebMvcConfig chargé dans la slice) ;
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
    @DisplayName("GET cycles → 200")
    void cycles_list_200() throws Exception {
        when(cycleService.listCycles(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/projects/1/cycles").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET pages → 200 (via JwtIdentityResolver)")
    void pages_list_200() throws Exception {
        when(pageService.listPages(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/projects/1/pages").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET dashboard-cards → 200")
    void dashboard_cards_list_200() throws Exception {
        when(dashboardCardService.list(anyString(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/dashboard-cards").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET congés d'un membre → 200")
    void member_leaves_list_200() throws Exception {
        when(memberLeaveService.listLeaves(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/members/5/leaves").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET profils de compétences → 200")
    void member_skills_list_200() throws Exception {
        when(skillService.listProfiles(anyString(), anyLong())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/skills").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET usage IA → 200")
    void ai_usage_200() throws Exception {
        when(aiUsageService.getUsage(anyString(), anyLong())).thenReturn(null);
        mockMvc.perform(get("/api/workspaces/acme/ai/usage").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET webhooks → 200")
    void webhooks_list_200() throws Exception {
        when(webhookService.list(anyString())).thenReturn(List.of());
        mockMvc.perform(get("/api/workspaces/acme/webhooks").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST suggestion de compétences → 200")
    void skill_suggestions_200() throws Exception {
        when(suggestionService.suggest(anyString(), anyString(), any(), anyLong())).thenReturn(List.of());
        mockMvc.perform(post("/api/workspaces/acme/skills/suggestions")
                .with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"Développeur\",\"existingSkills\":[\"react\"]}"))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET sans JWT → 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/dashboard-cards")).andExpect(status().isUnauthorized());
    }
}
