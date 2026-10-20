package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;

import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("MergedPullRequests : un ticket terminé quand sa pull request est fusionnée")
class MergedPullRequestsTest {

    @Mock private IssueService issueService;
    @Mock private ObjectProvider<IssueService> issueServiceProvider;
    @Mock private IssueRepository issueRepository;
    @Mock private IssueStatusRepository issueStatusRepository;
    @Mock private PlatformTransactionManager transactionManager;

    private MergedPullRequests merged;
    private Issue issue;

    @BeforeEach
    void setUp() {
        lenient().when(issueServiceProvider.getObject()).thenReturn(issueService);
        merged = new MergedPullRequests(issueServiceProvider, issueRepository, issueStatusRepository, transactionManager);
        Project project = Project.builder().id(5L).workspace(Workspace.builder().id(1L).slug("acme").build()).build();
        issue = Issue.builder().id(12L).project(project).reporter(User.builder().id(3L).build())
            .status(IssueStatus.builder().id(20L).category(IssueStatusCategory.STARTED).build()).build();
        when(issueRepository.findById(12L)).thenReturn(Optional.of(issue));
        lenient().when(issueStatusRepository.findByProjectIdAndCategory(5L, IssueStatusCategory.COMPLETED))
            .thenReturn(List.of(IssueStatus.builder().id(30L).category(IssueStatusCategory.COMPLETED).build()));
    }

    @Test
    @DisplayName("passe le ticket dans la première colonne terminée, au nom de la personne qui a lié la PR")
    void completes_the_issue_for_the_person_who_linked_it() {
        assertThat(merged.completeIssue(12L, 9L)).isTrue();

        ArgumentCaptor<UpdateIssueRequest> request = ArgumentCaptor.forClass(UpdateIssueRequest.class);
        verify(issueService).updateIssue(eq("acme"), eq(5L), eq(12L), request.capture(), eq(9L));
        assertThat(request.getValue().getStatusId()).isEqualTo(30L);
    }

    @Test
    @DisplayName("sans personne qui a lié la PR, au nom de celle qui a ouvert le ticket")
    void falls_back_to_the_reporter() {
        merged.completeIssue(12L, null);

        verify(issueService).updateIssue(eq("acme"), eq(5L), eq(12L), any(UpdateIssueRequest.class), eq(3L));
    }

    @ParameterizedTest(name = "ticket {0}")
    @EnumSource(value = IssueStatusCategory.class, names = {"COMPLETED", "CANCELLED"})
    @DisplayName("un ticket déjà terminé ou annulé ne bouge pas")
    void leaves_a_closed_issue(IssueStatusCategory category) {
        issue.setStatus(IssueStatus.builder().id(40L).category(category).build());

        assertThat(merged.completeIssue(12L, 9L)).isFalse();
        verify(issueService, never()).updateIssue(anyString(), anyLong(), anyLong(), any(), anyLong());
    }

    @Test
    @DisplayName("un ticket marqué terminé, ou un projet sans colonne terminée, ne bouge pas")
    void leaves_it_without_a_place_to_go() {
        issue.setCompletedAt(LocalDateTime.now());
        assertThat(merged.completeIssue(12L, 9L)).isFalse();

        issue.setCompletedAt(null);
        when(issueStatusRepository.findByProjectIdAndCategory(5L, IssueStatusCategory.COMPLETED)).thenReturn(List.of());
        assertThat(merged.completeIssue(12L, 9L)).isFalse();
        verify(issueService, never()).updateIssue(anyString(), anyLong(), anyLong(), any(), anyLong());
    }

    @Test
    @DisplayName("un échec n'empêche jamais la relecture des PR")
    void a_failure_never_stops_the_refresh() {
        when(issueService.updateIssue(anyString(), anyLong(), anyLong(), any(), anyLong()))
            .thenThrow(new IllegalStateException("not allowed"));

        assertThat(merged.completeIssue(12L, 9L)).isFalse();
    }
}
