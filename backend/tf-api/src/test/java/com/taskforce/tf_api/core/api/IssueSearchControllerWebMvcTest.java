package com.taskforce.tf_api.core.api;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

import com.taskforce.tf_api.core.dto.response.IssueCommentHitResponse;
import com.taskforce.tf_api.core.dto.response.IssueHitResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.IssueCommentSearchService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

/**
 * La recherche d'issues de la fenêtre (R123, R124) : Ctrl+K et le compositeur la lisent ; le texte est borné, et rien ne
 * se lit sans jeton.
 */
@WebMvcTest(IssueSearchController.class)
@Import({SecurityConfig.class, JwtIdentityResolver.class})
@ActiveProfiles("test")
@DisplayName("IssueSearchController (@WebMvcTest)")
class IssueSearchControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private IssueService issueService;
    @MockitoBean private IssueCommentSearchService commentSearchService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/issues/search";

    private void stubUser() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    @Test
    @DisplayName("GET ?q=OPS-35 → 200, les issues trouvées dans l'enveloppe, la limite passée au service")
    void finds_issues_by_key() throws Exception {
        stubUser();
        when(issueService.searchIssues("acme", 7L, "OPS-35", 5)).thenReturn(List.of(
            new IssueHitResponse(35L, 3L, "OPS-35", "Iteration #35", "In review by AI", "IN_PROGRESS")));

        mockMvc.perform(get(URL).param("q", "OPS-35").param("limit", "5").with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].key").value("OPS-35"))
            .andExpect(jsonPath("$.data[0].projectId").value(3))
            .andExpect(jsonPath("$.data[0].status").value("In review by AI"));
    }

    @Test
    @DisplayName("GET sans q → les dernières changées (texte vide), 8 par défaut")
    void without_a_query_lists_the_latest() throws Exception {
        stubUser();
        when(issueService.searchIssues("acme", 7L, "", 8)).thenReturn(List.of());

        mockMvc.perform(get(URL).with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data").isEmpty());
        verify(issueService).searchIssues("acme", 7L, "", 8);
    }

    @Test
    @DisplayName("un texte trop long est coupé avant la recherche")
    void a_long_query_is_cut() throws Exception {
        stubUser();
        String longQuery = "a".repeat(IssueSearchController.MAX_QUERY + 50);
        when(issueService.searchIssues(eq("acme"), eq(7L), anyString(), anyInt())).thenReturn(List.of());

        mockMvc.perform(get(URL).param("q", longQuery).with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk());
        verify(issueService).searchIssues("acme", 7L, "a".repeat(IssueSearchController.MAX_QUERY), 8);
    }

    @Test
    @DisplayName("GET sans JWT → 401, rien n'est cherché")
    void unauthenticated_returns_401() throws Exception {
        mockMvc.perform(get(URL).param("q", "OPS"))
            .andExpect(status().isUnauthorized());
        verify(issueService, never()).searchIssues(anyString(), org.mockito.ArgumentMatchers.anyLong(), anyString(), anyInt());
    }

    @Test
    @DisplayName("GET /search/comments?q=deploy → 200, l'issue et le passage, 5 par défaut")
    void finds_issues_by_their_comments() throws Exception {
        stubUser();
        when(commentSearchService.search("acme", 7L, "deploy", 5)).thenReturn(List.of(
            new IssueCommentHitResponse(35L, 3L, "OPS-35", "Iteration #35", "The deploy failed")));

        mockMvc.perform(get(URL + "/comments").param("q", "deploy").with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].issueId").value(35))
            .andExpect(jsonPath("$.data[0].projectId").value(3))
            .andExpect(jsonPath("$.data[0].key").value("OPS-35"))
            .andExpect(jsonPath("$.data[0].excerpt").value("The deploy failed"));
    }

    @Test
    @DisplayName("GET /search/comments : le texte est coupé, et la limite passée au service")
    void comments_query_is_bounded() throws Exception {
        stubUser();
        when(commentSearchService.search(eq("acme"), eq(7L), anyString(), anyInt())).thenReturn(List.of());

        mockMvc.perform(get(URL + "/comments").param("q", "a".repeat(IssueSearchController.MAX_QUERY + 50)).param("limit", "9")
                .with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk());
        verify(commentSearchService).search("acme", 7L, "a".repeat(IssueSearchController.MAX_QUERY), 9);
    }

    @Test
    @DisplayName("GET /search/comments sans JWT → 401, rien n'est cherché")
    void comments_need_a_token() throws Exception {
        mockMvc.perform(get(URL + "/comments").param("q", "deploy"))
            .andExpect(status().isUnauthorized());
        verify(commentSearchService, never()).search(anyString(), org.mockito.ArgumentMatchers.anyLong(), anyString(), anyInt());
    }
}
