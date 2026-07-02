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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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

    // ---- endpoints additionnels (couverture) -------------------------------
    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET /statuses et /types → 200")
    void list_statuses_and_types() throws Exception {
        stubUser();
        when(issueService.listStatuses(anyString(), anyLong(), anyLong())).thenReturn(List.of());
        when(issueService.listTypes(anyString(), anyLong(), anyLong())).thenReturn(List.of());

        mockMvc.perform(get(BASE + "/statuses").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/types").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET /paged, /{id}/comments, /{id}/activity, /{id}/children → 200")
    void list_various() throws Exception {
        stubUser();
        when(issueService.listComments(anyString(), anyLong(), anyLong(), anyLong())).thenReturn(List.of());
        when(issueService.listActivity(anyString(), anyLong(), anyLong(), anyLong())).thenReturn(List.of());
        when(issueService.listChildren(anyString(), anyLong(), anyLong(), anyLong())).thenReturn(List.of());

        mockMvc.perform(get(BASE + "/paged").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/9/comments").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/9/activity").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/9/children").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST /{id}/comments → 2xx")
    void add_comment_2xx() throws Exception {
        stubUser();
        when(issueService.addComment(anyString(), anyLong(), anyLong(), any(), anyLong())).thenReturn(null);

        mockMvc.perform(post(BASE + "/9/comments").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"content\":\"Salut\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /statuses → 2xx")
    void create_status_2xx() throws Exception {
        stubUser();
        when(issueService.createStatus(anyString(), anyLong(), any(), anyLong())).thenReturn(null);

        mockMvc.perform(post(BASE + "/statuses").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Review\",\"color\":\"#123456\",\"category\":\"STARTED\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("PATCH /{id}/archive et /{id}/pin → 2xx")
    void archive_and_pin() throws Exception {
        stubUser();
        when(issueService.setArchived(anyString(), anyLong(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean(), anyLong()))
            .thenReturn(issue(9L, "x"));
        when(issueService.setPinned(anyString(), anyLong(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean(), anyLong()))
            .thenReturn(issue(9L, "x"));

        mockMvc.perform(patch(BASE + "/9/archive").with(auth())).andExpect(status().is2xxSuccessful());
        mockMvc.perform(patch(BASE + "/9/pin").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"pinned\":true}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("DELETE /{id} → 2xx")
    void delete_issue_2xx() throws Exception {
        stubUser();

        mockMvc.perform(delete(BASE + "/9").with(auth())).andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /smart-assign/preview → 2xx")
    void smart_assign_preview_2xx() throws Exception {
        stubUser();
        when(smartAssignService.preview(anyString(), anyLong(), anyLong(), any())).thenReturn(null);

        mockMvc.perform(post(BASE + "/smart-assign/preview").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Bug\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("GET checklist/worklogs/relations → 200")
    void list_sub_resources() throws Exception {
        stubUser();
        when(issueService.listChecklist(anyString(), anyLong(), anyLong(), anyLong())).thenReturn(List.of());
        when(issueService.listWorklogs(anyString(), anyLong(), anyLong(), anyLong())).thenReturn(List.of());
        when(issueService.listRelations(anyString(), anyLong(), anyLong(), anyLong())).thenReturn(List.of());

        mockMvc.perform(get(BASE + "/9/checklist").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/9/worklogs").with(auth())).andExpect(status().isOk());
        mockMvc.perform(get(BASE + "/9/relations").with(auth())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST checklist/worklogs/relations → 2xx")
    void add_sub_resources() throws Exception {
        stubUser();
        when(issueService.addChecklistItem(anyString(), anyLong(), anyLong(), anyLong(), any())).thenReturn(null);
        when(issueService.addWorklog(anyString(), anyLong(), anyLong(), anyLong(), any())).thenReturn(null);
        when(issueService.addRelation(anyString(), anyLong(), anyLong(), any(), anyLong())).thenReturn(null);

        mockMvc.perform(post(BASE + "/9/checklist").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"content\":\"x\"}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(post(BASE + "/9/worklogs").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"minutes\":30}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(post(BASE + "/9/relations").with(auth())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"targetIssueId\":2,\"relationType\":\"RELATES_TO\"}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("PATCH /{id}/unarchive et DELETEs sous-ressources → 2xx")
    void unarchive_and_deletes() throws Exception {
        stubUser();
        when(issueService.setArchived(anyString(), anyLong(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean(), anyLong()))
            .thenReturn(issue(9L, "x"));

        mockMvc.perform(patch(BASE + "/9/unarchive").with(auth())).andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(BASE + "/9/checklist/1").with(auth())).andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(BASE + "/9/worklogs/1").with(auth())).andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(BASE + "/9/relations/1").with(auth())).andExpect(status().is2xxSuccessful());
    }

    // ---- endpoints additionnels (2e vague de couverture) -------------------

    @Test
    @DisplayName("PATCH /{id} (mise à jour issue) → 200 + enveloppe ApiResponse")
    void update_issue_returns_200() throws Exception {
        stubUser();
        when(issueService.updateIssue(anyString(), anyLong(), anyLong(), any(), anyLong()))
            .thenReturn(issue(9L, "Titre modifié"));

        mockMvc.perform(patch(BASE + "/9").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Titre modifié\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.title").value("Titre modifié"));
    }

    @Test
    @DisplayName("PATCH /{id} sans JWT → 401")
    void update_issue_unauthenticated_returns_401() throws Exception {
        mockMvc.perform(patch(BASE + "/9")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"x\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("PATCH et DELETE /statuses/{id} → 2xx")
    void update_and_delete_status() throws Exception {
        stubUser();
        when(issueService.updateStatus(anyString(), anyLong(), anyLong(), any(), anyLong())).thenReturn(null);

        mockMvc.perform(patch(BASE + "/statuses/3").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"En cours\"}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(BASE + "/statuses/3").with(auth())).andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /statuses/reorder → 2xx")
    void reorder_statuses_2xx() throws Exception {
        stubUser();
        when(issueService.reorderStatuses(anyString(), anyLong(), any(), anyLong())).thenReturn(List.of());

        mockMvc.perform(post(BASE + "/statuses/reorder").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"statuses\":[{\"id\":1,\"position\":0},{\"id\":2,\"position\":1}]}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /statuses/reorder liste vide (@NotEmpty) → 400")
    void reorder_statuses_empty_returns_400() throws Exception {
        stubUser();

        mockMvc.perform(post(BASE + "/statuses/reorder").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"statuses\":[]}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PATCH et DELETE /{id}/comments/{commentId} → 2xx")
    void update_and_delete_comment() throws Exception {
        stubUser();
        when(issueService.updateComment(anyString(), anyLong(), anyLong(), anyLong(), any(), anyLong()))
            .thenReturn(null);

        mockMvc.perform(patch(BASE + "/9/comments/5").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"Corrigé\"}"))
            .andExpect(status().is2xxSuccessful());
        mockMvc.perform(delete(BASE + "/9/comments/5").with(auth())).andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("PATCH /{id}/comments/{commentId} contenu vide (@NotBlank) → 400")
    void update_comment_blank_returns_400() throws Exception {
        stubUser();

        mockMvc.perform(patch(BASE + "/9/comments/5").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PATCH /{id}/checklist/{itemId} → 2xx")
    void update_checklist_item_2xx() throws Exception {
        stubUser();
        when(issueService.updateChecklistItem(anyString(), anyLong(), anyLong(), anyLong(), anyLong(), any()))
            .thenReturn(null);

        mockMvc.perform(patch(BASE + "/9/checklist/2").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"done\":true}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /{id}/smart-assign → 2xx")
    void smart_assign_2xx() throws Exception {
        stubUser();
        when(smartAssignService.recommend(anyString(), anyLong(), anyLong(), anyLong())).thenReturn(null);

        mockMvc.perform(post(BASE + "/9/smart-assign").with(auth()))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /smart-assign/bulk → 2xx")
    void smart_assign_bulk_2xx() throws Exception {
        stubUser();
        when(smartAssignService.bulkRecommend(anyString(), anyLong(), anyLong(), any())).thenReturn(List.of());

        mockMvc.perform(post(BASE + "/smart-assign/bulk").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"issueIds\":[1,2,3]}"))
            .andExpect(status().is2xxSuccessful());
    }

    @Test
    @DisplayName("POST /smart-assign/bulk liste vide (@NotEmpty) → 400")
    void smart_assign_bulk_empty_returns_400() throws Exception {
        stubUser();

        mockMvc.perform(post(BASE + "/smart-assign/bulk").with(auth())
                .contentType(MediaType.APPLICATION_JSON).content("{\"issueIds\":[]}"))
            .andExpect(status().isBadRequest());
    }
}
