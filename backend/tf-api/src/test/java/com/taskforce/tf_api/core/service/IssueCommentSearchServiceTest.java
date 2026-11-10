package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.taskforce.tf_api.core.dto.response.IssueCommentHitResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

/** La recherche dans les commentaires (Ctrl+K, R141) : les projets que la personne voit, une ligne par issue. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("IssueCommentSearchService")
class IssueCommentSearchServiceTest {

    private static final Long WORKSPACE = 1L;
    private static final Long USER = 7L;

    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private IssueCommentRepository commentRepository;

    @InjectMocks private IssueCommentSearchService service;

    private final Project project = Project.builder().id(3L).identifier("OPS").build();

    @BeforeEach
    void setUp() {
        when(workspaceRepository.findBySlug("acme")).thenReturn(Optional.of(Workspace.builder().id(WORKSPACE).build()));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WORKSPACE, USER)).thenReturn(true);
        when(visibilityGuard.viewableProjectIds(WORKSPACE, USER)).thenReturn(List.of(3L, 5L));
    }

    private IssueComment comment(long issueId, int number, String content) {
        Issue issue = Issue.builder().id(issueId).title("Issue " + number).sequenceNumber(number).project(project).build();
        return IssueComment.builder().issue(issue).content(content).build();
    }

    @Test
    @DisplayName("cherche chaque mot en préfixe, sur les projets que la personne voit, et rend le passage")
    void searches_the_projects_the_person_sees() {
        when(commentRepository.searchInProjects(List.of(3L, 5L), "deploy:* & fail:*", 15))
            .thenReturn(List.of(comment(35L, 35, "The **deploy** failed on Monday")));

        List<IssueCommentHitResponse> hits = service.search("acme", USER, "deploy fail", 5);

        assertThat(hits).containsExactly(new IssueCommentHitResponse(35L, 3L, "OPS-35", "Issue 35", "The deploy failed on Monday"));
    }

    @Test
    @DisplayName("plusieurs commentaires d'une issue : une ligne, le plus récent, l'ordre gardé")
    void one_row_per_issue() {
        when(commentRepository.searchInProjects(any(), anyString(), anyInt())).thenReturn(List.of(
            comment(35L, 35, "latest on 35"),
            comment(12L, 12, "on 12"),
            comment(35L, 35, "older on 35")));

        List<IssueCommentHitResponse> hits = service.search("acme", USER, "on", 5);

        assertThat(hits).extracting(IssueCommentHitResponse::key).containsExactly("OPS-35", "OPS-12");
        assertThat(hits.get(0).excerpt()).isEqualTo("latest on 35");
    }

    @Test
    @DisplayName("rend au plus ce qu'on demande, jamais plus que le plafond")
    void the_limit_is_bounded() {
        when(commentRepository.searchInProjects(any(), anyString(), anyInt())).thenReturn(List.of(
            comment(1L, 1, "a word"), comment(2L, 2, "a word"), comment(3L, 3, "a word")));

        assertThat(service.search("acme", USER, "word", 2)).hasSize(2);

        service.search("acme", USER, "word", 500);
        verify(commentRepository).searchInProjects(any(), anyString(), eq(IssueCommentSearchService.MAX * 3));
    }

    @ParameterizedTest(name = "« {0} » ne contient pas de mot")
    @ValueSource(strings = {"", " ", "a", "!!", "&|:*"})
    @DisplayName("sans mot de deux caractères, ne lit rien")
    void without_a_word_reads_nothing(String query) {
        assertThat(service.search("acme", USER, query, 5)).isEmpty();
        verify(commentRepository, never()).searchInProjects(any(), anyString(), anyInt());
    }

    @Test
    @DisplayName("aucun projet visible : ne lit rien")
    void no_visible_project() {
        when(visibilityGuard.viewableProjectIds(WORKSPACE, USER)).thenReturn(List.of());

        assertThat(service.search("acme", USER, "deploy", 5)).isEmpty();
        verify(commentRepository, never()).searchInProjects(any(), anyString(), anyInt());
    }

    @ParameterizedTest(name = "espace {0}, membre {1}")
    @CsvSource({"true, false", "false, true"})
    @DisplayName("un espace absent, ou dont on n'est pas membre, ne répond rien")
    void needs_a_workspace_and_its_membership(boolean exists, boolean member) {
        if (!exists) when(workspaceRepository.findBySlug("acme")).thenReturn(Optional.empty());
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WORKSPACE, USER)).thenReturn(member);

        assertThatThrownBy(() -> service.search("acme", USER, "deploy", 5))
            .isInstanceOf(exists ? BusinessException.class : ResourceNotFoundException.class);
        verify(commentRepository, never()).searchInProjects(any(), anyString(), anyInt());
    }
}
