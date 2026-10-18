package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.RunnerApprovalResponse;
import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.NotificationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Activité d'un run (OSS-5.3, OSS-5.4) : chronologie bornée et ordonnée, demandes de validation qui expirent, et une
 * décision réservée à la personne qui a délégué.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DeliveryActivityService")
class DeliveryActivityServiceTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private DeliveryRunEventRepository eventRepository;
    @Mock private DeliveryRunApprovalRepository approvalRepository;
    @Mock private UserRepository userRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private NotificationService notificationService;

    private DeliveryActivityService service;
    private User delegator;
    private User teammate;
    private DeliveryRun run;

    @BeforeEach
    void setUp() {
        LocalRunnerSettings settings = new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15, 10);
        service = new DeliveryActivityService(runRepository, eventRepository, approvalRepository, userRepository,
            visibilityGuard, notificationService, settings);
        delegator = User.builder().id(7L).email("ada@taskforce.dev").displayName("Ada").build();
        teammate = User.builder().id(8L).email("linus@taskforce.dev").build();
        Workspace workspace = Workspace.builder().slug("acme").build();
        Project project = Project.builder().id(12L).workspace(workspace).build();
        Issue issue = Issue.builder().id(55L).title("Fix the footer").project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.RUNNING)
            .startedBy(delegator).build();
        lenient().when(runRepository.findById(100L)).thenReturn(Optional.of(run));
        lenient().when(approvalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    // --------------------------------------------------------------------- chronologie

    @Test
    void events_follow_the_last_sequence_number_and_are_clipped() {
        when(eventRepository.maxSeq(100L)).thenReturn(4);

        service.appendEvents(run, List.of(
            new RunnerEventsRequest.Event("tool", "  ", "npm test"),
            new RunnerEventsRequest.Event("text", null, "x".repeat(3000))));

        ArgumentCaptor<DeliveryRunEvent> saved = ArgumentCaptor.forClass(DeliveryRunEvent.class);
        verify(eventRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(DeliveryRunEvent::getSeq).containsExactly(5, 6);
        assertThat(saved.getAllValues().get(0).getTool()).isNull();
        assertThat(saved.getAllValues().get(1).getText()).hasSize(DeliveryActivityService.MAX_TEXT).endsWith("...");
    }

    @Test
    void events_beyond_the_cap_are_dropped() {
        when(eventRepository.maxSeq(100L)).thenReturn(DeliveryActivityService.MAX_EVENTS_PER_RUN - 1);
        List<RunnerEventsRequest.Event> batch = new ArrayList<>();
        for (int i = 0; i < 5; i++) batch.add(new RunnerEventsRequest.Event("text", null, "e" + i));

        service.appendEvents(run, batch);

        verify(eventRepository, org.mockito.Mockito.times(1)).save(any());
    }

    // --------------------------------------------------------------------- validations, côté runner

    @Test
    void opening_an_approval_notifies_the_delegator() {
        RunnerApprovalResponse response = service.openApproval(run, " Bash ", "npm install lodash");

        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(response.expiresAt()).isBetween(LocalDateTime.now().plusMinutes(9), LocalDateTime.now().plusMinutes(11));
        verify(notificationService).notifyAgentApproval(run.getIssue(), delegator, "Bash", "npm install lodash");
    }

    @Test
    void a_pending_approval_past_its_deadline_expires_when_read() {
        DeliveryRunApproval approval = approval(DeliveryApprovalStatus.PENDING, LocalDateTime.now().minusSeconds(1));
        when(approvalRepository.findByIdAndRunId(9L, 100L)).thenReturn(Optional.of(approval));

        assertThat(service.approvalStatus(run, 9L).status()).isEqualTo("EXPIRED");
    }

    @Test
    void closing_a_run_expires_its_open_approvals() {
        service.closeApprovals(100L);

        verify(approvalRepository).expirePending(eq(100L), any(), eq(DeliveryApprovalStatus.PENDING), eq(DeliveryApprovalStatus.EXPIRED));
    }

    // --------------------------------------------------------------------- personne connectée

    @Test
    void the_delegator_allows_a_pending_action() {
        DeliveryRunApproval approval = approval(DeliveryApprovalStatus.PENDING, LocalDateTime.now().plusMinutes(5));
        when(approvalRepository.findByIdAndRunId(9L, 100L)).thenReturn(Optional.of(approval));
        when(userRepository.getReferenceById(7L)).thenReturn(delegator);

        service.decide("acme", 100L, 9L, true, 7L);

        assertThat(approval.getStatus()).isEqualTo(DeliveryApprovalStatus.ALLOWED);
        assertThat(approval.getDecidedBy()).isEqualTo(delegator);
        assertThat(approval.getDecidedAt()).isNotNull();
    }

    @Test
    void a_teammate_cannot_answer_for_the_delegator() {
        assertThatThrownBy(() -> service.decide("acme", 100L, 9L, true, 8L))
            .isInstanceOf(ForbiddenException.class)
            .hasMessageContaining("Only the person who delegated");
        verify(approvalRepository, never()).findByIdAndRunId(any(), any());
    }

    static Stream<Arguments> closedRequests() {
        return Stream.of(
            Arguments.of(DeliveryApprovalStatus.ALLOWED, LocalDateTime.now().plusMinutes(5), DeliveryRunStatus.RUNNING, "already answered"),
            Arguments.of(DeliveryApprovalStatus.PENDING, LocalDateTime.now().minusSeconds(1), DeliveryRunStatus.RUNNING, "expired"),
            Arguments.of(DeliveryApprovalStatus.PENDING, LocalDateTime.now().plusMinutes(5), DeliveryRunStatus.DONE, "expired"));
    }

    @ParameterizedTest(name = "{0}, run {2} : {3}")
    @MethodSource("closedRequests")
    void a_closed_request_cannot_be_decided(DeliveryApprovalStatus status, LocalDateTime expiresAt, DeliveryRunStatus runStatus, String message) {
        run.setStatus(runStatus);
        when(approvalRepository.findByIdAndRunId(9L, 100L)).thenReturn(Optional.of(approval(status, expiresAt)));

        assertThatThrownBy(() -> service.decide("acme", 100L, 9L, false, 7L))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining(message);
    }

    @Test
    void a_run_of_another_workspace_is_not_found() {
        assertThatThrownBy(() -> service.activity("other", 100L, 0, 7L)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.decide("other", 100L, 9L, true, 7L)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void activity_lets_only_the_delegator_decide() {
        DeliveryRunApproval pending = approval(DeliveryApprovalStatus.PENDING, LocalDateTime.now().plusMinutes(5));
        when(eventRepository.findByRunIdAndSeqGreaterThanOrderBySeqAsc(eq(100L), eq(3), any())).thenReturn(List.of(
            DeliveryRunEvent.builder().seq(4).kind("tool").tool("Bash").text("npm test").build()));
        when(approvalRepository.findByRunIdOrderByCreatedAtAsc(100L)).thenReturn(List.of(pending));

        DeliveryRunActivityResponse forDelegator = service.activity("acme", 100L, 3, 7L);
        DeliveryRunActivityResponse forTeammate = service.activity("acme", 100L, 3, 8L);

        assertThat(forDelegator.events()).extracting(DeliveryRunActivityResponse.Event::seq).containsExactly(4);
        assertThat(forDelegator.approvals().get(0).canDecide()).isTrue();
        assertThat(forTeammate.approvals().get(0).canDecide()).isFalse();
        verify(visibilityGuard).assertCanView(run.getIssue().getProject(), 8L);
    }

    @Test
    void activity_requires_seeing_the_project() {
        org.mockito.Mockito.doThrow(new ForbiddenException("private project"))
            .when(visibilityGuard).assertCanView(any(Project.class), eq(8L));

        assertThatThrownBy(() -> service.activity("acme", 100L, 0, 8L)).isInstanceOf(ForbiddenException.class);
        verify(eventRepository, never()).findByRunIdAndSeqGreaterThanOrderBySeqAsc(any(), anyInt(), any());
    }

    private DeliveryRunApproval approval(DeliveryApprovalStatus status, LocalDateTime expiresAt) {
        DeliveryRunApproval approval = DeliveryRunApproval.builder()
            .id(9L).run(run).tool("Bash").summary("npm install lodash").status(status).expiresAt(expiresAt).build();
        approval.setCreatedAt(LocalDateTime.now().minusMinutes(1));
        return approval;
    }
}
