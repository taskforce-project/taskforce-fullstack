package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.model.AssignmentStatus;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

/**
 * Retirer l'assigné ou l'échéance d'une issue : un champ à null ne dit rien dans un patch partiel, alors le patch le dit
 * ({@code unassign}, {@code clearDueDate}). « Undo » s'en sert pour remettre une issue que Cortex a assignée (R77).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Retirer l'assigné et l'échéance d'une issue")
class IssueServiceClearFieldsTest {

    @Mock private IssueRepository issueRepository;
    @Mock private IssueActivityRepository activityRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private UserRepository userRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private SlackIntegrationService slackService;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private ApplicationEventPublisher events;

    @InjectMocks private IssueService service;

    private final User pierre = User.builder().id(1L).email("pierre@acme.dev").build();
    private final User ada = User.builder().id(2L).email("ada@acme.dev").build();
    private final Workspace workspace = Workspace.builder().id(4L).slug("acme").build();
    private final Project project = Project.builder().id(3L).identifier("TF").workspace(workspace).build();
    private Issue issue;

    @BeforeEach
    void setUp() {
        issue = Issue.builder().id(55L).sequenceNumber(12).project(project).title("Fix login").reporter(pierre)
            .status(IssueStatus.builder().id(9L).name("Todo").build())
            .assignee(ada).assignedBy(pierre).assignmentStatus(AssignmentStatus.PENDING)
            .dueDate(LocalDate.of(2026, 12, 1)).build();
        when(workspaceRepository.findBySlug("acme")).thenReturn(Optional.of(workspace));
        when(projectRepository.findByIdAndWorkspaceId(3L, 4L)).thenReturn(Optional.of(project));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(4L, 1L)).thenReturn(true);
        when(issueRepository.findById(55L)).thenReturn(Optional.of(issue));
        when(userRepository.findById(1L)).thenReturn(Optional.of(pierre));
        when(issueRepository.save(any(Issue.class))).thenAnswer(saved -> saved.getArgument(0));
    }

    @Test
    void unassign_and_clear_the_due_date() {
        UpdateIssueRequest request = new UpdateIssueRequest();
        request.setUnassign(true);
        request.setClearDueDate(true);

        var updated = service.updateIssue("acme", 3L, 55L, request, 1L);

        assertThat(updated.getAssignee()).isNull();
        assertThat(updated.getDueDate()).isNull();
        assertThat(updated.getAssignmentStatus()).isNull();
        ArgumentCaptor<IssueActivity> activity = ArgumentCaptor.forClass(IssueActivity.class);
        verify(activityRepository, atLeastOnce()).save(activity.capture());
        assertThat(activity.getAllValues()).extracting(IssueActivity::getAction, IssueActivity::getOldValue)
            .contains(org.assertj.core.groups.Tuple.tuple(IssueActivityType.ASSIGNEE_CHANGED, "ada@acme.dev"),
                org.assertj.core.groups.Tuple.tuple(IssueActivityType.DUE_DATE_CHANGED, "2026-12-01"));
    }

    @Test
    @DisplayName("un champ à null ne change rien : le patch partiel reste partiel")
    void a_null_field_changes_nothing() {
        UpdateIssueRequest request = new UpdateIssueRequest();
        request.setTitle("Fix the login");

        var updated = service.updateIssue("acme", 3L, 55L, request, 1L);

        assertThat(updated.getAssignee()).isNotNull();
        assertThat(updated.getDueDate()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(IssueService.isPositionOnly(request)).isFalse();
    }
}
