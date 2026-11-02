package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest;
import com.taskforce.tf_api.core.dto.response.IssueRealtimeEvent;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.security.DeliverySessionFilter;

/**
 * Rejeu de la 1.8.0 (02/11/2026) : dans le run 7, l'agent a commenté l'issue par la session déléguée
 * ({@code add_comment}, sans erreur), mais l'activité collée par le CEO ne montrait que la création. Le commentaire est
 * gardé, son activité dit qu'il est passé par l'agent, et la fiche ouverte l'apprend après le commit, sans être rouverte.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Le commentaire d'un agent sur l'issue : gardé, dit, et annoncé à la fiche ouverte")
class IssueServiceAgentCommentTest {

    @Mock private IssueRepository issueRepository;
    @Mock private IssueCommentRepository commentRepository;
    @Mock private IssueActivityRepository activityRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private UserRepository userRepository;
    @Mock private NotificationService notificationService;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private SlackIntegrationService slackService;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private ApplicationEventPublisher events;

    @InjectMocks private IssueService service;

    private final User pierre = User.builder().id(1L).email("pierre@acme.dev").displayName("Pierre").build();
    private final Workspace workspace = Workspace.builder().id(4L).slug("pierre").build();
    private final Project testta = Project.builder().id(3L).identifier("TESTTA").workspace(workspace).build();
    private final Issue issue = Issue.builder().id(55L).sequenceNumber(2).project(testta).build();

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }

    /** La session déléguée du run 7, au nom de Pierre (ADR-013). */
    private static void delegatedSession() {
        Jwt delegated = Jwt.withTokenValue("t").header("alg", "none").claim("email", "pierre@acme.dev")
            .claim(DeliverySessionFilter.RUN_CLAIM, 7L).claim(DeliverySessionFilter.AGENT_CLAIM, "Claude Code").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(delegated, List.of(), "pierre@acme.dev"));
    }

    private void anIssueToComment() {
        when(workspaceRepository.findBySlug("pierre")).thenReturn(Optional.of(workspace));
        when(projectRepository.findByIdAndWorkspaceId(3L, 4L)).thenReturn(Optional.of(testta));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(4L, 1L)).thenReturn(true);
        when(issueRepository.findById(55L)).thenReturn(Optional.of(issue));
        when(userRepository.findById(1L)).thenReturn(Optional.of(pierre));
        when(commentRepository.save(any(IssueComment.class))).thenAnswer(saved -> saved.getArgument(0));
    }

    private static CreateIssueCommentRequest comment(String text) {
        CreateIssueCommentRequest request = new CreateIssueCommentRequest();
        request.setContent(text);
        return request;
    }

    @Test
    @DisplayName("par la session déléguée : le commentaire gardé, « Claude Code » à l'activité, la fiche avertie après le commit")
    void the_agents_comment_is_kept_said_and_announced_after_commit() {
        delegatedSession();
        anIssueToComment();
        TransactionSynchronizationManager.initSynchronization();

        service.addComment("pierre", 3L, 55L, comment("The footer links already work: nothing to change."), 1L);

        ArgumentCaptor<IssueComment> kept = ArgumentCaptor.forClass(IssueComment.class);
        verify(commentRepository).save(kept.capture());
        assertThat(kept.getValue().getAuthor()).isEqualTo(pierre);
        assertThat(kept.getValue().getContent()).isEqualTo("The footer links already work: nothing to change.");
        ArgumentCaptor<IssueActivity> logged = ArgumentCaptor.forClass(IssueActivity.class);
        verify(activityRepository).save(logged.capture());
        assertThat(logged.getValue().getAction()).isEqualTo(IssueActivityType.COMMENT_ADDED);
        assertThat(logged.getValue().getActor()).isEqualTo(pierre);
        assertThat(logged.getValue().getVia()).isEqualTo("Claude Code");

        // Rien n'est annoncé avant le commit : la fiche relirait un fil sans le commentaire.
        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

        ArgumentCaptor<Object> sent = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(org.mockito.ArgumentMatchers.eq("/topic/projects.3"), sent.capture());
        assertThat(sent.getValue()).isInstanceOfSatisfying(IssueRealtimeEvent.class, event -> {
            assertThat(event.getAction()).isEqualTo("activity");
            assertThat(event.getProjectId()).isEqualTo(3L);
            assertThat(event.getIssueId()).isEqualTo(55L);
            assertThat(event.getIssue()).isNull();
        });
    }

    @Test
    @DisplayName("hors transaction : l'activité est annoncée tout de suite")
    void outside_a_transaction_the_activity_is_announced_at_once() {
        service.logActivity(issue, pierre, IssueActivityType.MISSION_MARKED_DONE, null, null, null);

        verify(messagingTemplate).convertAndSend(org.mockito.ArgumentMatchers.eq("/topic/projects.3"),
            any(IssueRealtimeEvent.class));
    }

    @Test
    @DisplayName("une issue sans projet connu n'annonce rien")
    void an_issue_without_its_project_announces_nothing() {
        service.logActivity(Issue.builder().id(55L).build(), pierre, IssueActivityType.COMMENT_ADDED, null, null, null);

        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
    }
}
