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

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.SmartAssignService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web (B-T6) — {@link IssueController} via {@code @WebMvcTest} + MockMvc.
 * Même recette que {@link RedistributionControllerWebMvcTest} (sécu HS512 réelle + {@code jwt()} PP,
 * repos de l'intercepteur mockés → fail-open). Valide le contrat CRUD : 201 à la création,
 * enveloppe {@code ApiResponse}, {@code @Valid}→400, 401 sans JWT, 200 en lecture.
 */
@WebMvcTest(IssueController.class)
@Import({SecurityConfig.class, JwtIdentityResolver.class})
@ActiveProfiles("test")
@DisplayName("IssueController (@WebMvcTest)")
class IssueControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private IssueService issueService;
    @MockitoBean private SmartAssignService smartAssignService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;             // WorkspaceAccessInterceptor
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository; // WorkspaceAccessInterceptor

    private static final String EMAIL = "dev@it.dev";
    private static final String BASE = "/api/workspaces/acme/projects/5/issues";

    private void stubUser() {
        when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    private IssueResponse issue(long id, String title) {
        return IssueResponse.builder().id(id).title(title).sequenceNumber(1).build();
    }

    @Test
    @DisplayName("POST valide → 201 + enveloppe ApiResponse")
    void create_valid_returns_201() throws Exception {
        stubUser();
        when(issueService.createIssue(anyString(), anyLong(), any(), anyLong()))
            .thenReturn(issue(42L, "Login bug"));

        mockMvc.perform(post(BASE)
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Login bug\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.title").value("Login bug"));
    }

    @Test
    @DisplayName("POST sans titre (@NotBlank) → 400")
    void create_blank_title_returns_400() throws Exception {
        stubUser();

        mockMvc.perform(post(BASE)
                .with(jwt().jwt(b -> b.claim("email", EMAIL)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST sans JWT → 401")
    void create_unauthenticated_returns_401() throws Exception {
        mockMvc.perform(post(BASE)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"x\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET liste → 200 + tableau data")
    void list_returns_200_array() throws Exception {
        stubUser();
        when(issueService.listIssues(anyString(), anyLong(), anyLong()))
            .thenReturn(List.of(issue(1L, "A"), issue(2L, "B")));

        mockMvc.perform(get(BASE).with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    @DisplayName("GET issue inexistante → 404 (ResourceNotFoundException)")
    void get_unknown_returns_404() throws Exception {
        stubUser();
        when(issueService.getIssue(anyString(), anyLong(), anyLong(), anyLong()))
            .thenThrow(new ResourceNotFoundException("Issue introuvable"));

        mockMvc.perform(get(BASE + "/999").with(jwt().jwt(b -> b.claim("email", EMAIL))))
            .andExpect(status().isNotFound());
    }
}
