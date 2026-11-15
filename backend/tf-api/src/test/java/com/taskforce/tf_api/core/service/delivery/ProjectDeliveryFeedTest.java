package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.dto.response.ProjectDeliveryEvent;
import com.taskforce.tf_api.core.dto.response.ProjectRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunOutcome;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Le topic des missions d'un projet (R166) : ce qui change d'une mission s'annonce après le commit, à qui voit le projet,
 * avec son étape en cours et sans ce qui dépend de la personne qui lit ; une panne du temps réel ne fait jamais échouer
 * la mission.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProjectDeliveryFeed : le topic des missions d'un projet")
class ProjectDeliveryFeedTest {

    @Mock private SimpMessagingTemplate messaging;
    @Mock private MissionStepReader steps;

    @InjectMocks private ProjectDeliveryFeed feed;

    private final Project project = Project.builder().id(12L).build();
    private final Issue issue = Issue.builder().id(55L).project(project).build();
    private final DeliveryRun run = DeliveryRun.builder().id(100L).issue(issue).status(DeliveryRunStatus.RUNNING).build();
    private final LocalDateTime at = LocalDateTime.of(2026, 11, 13, 10, 0);
    private final ProjectRunResponse.Step doing = new ProjectRunResponse.Step("do", 14, "tool", "Edit", at);

    @BeforeEach
    void setUp() {
        lenient().when(steps.stepOf(run)).thenReturn(doing);
    }

    @AfterEach
    void clear() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }

    private ProjectDeliveryEvent sent() {
        ArgumentCaptor<ProjectDeliveryEvent> event = ArgumentCaptor.forClass(ProjectDeliveryEvent.class);
        verify(messaging).convertAndSend(eq("/topic/projects.12.delivery"), event.capture());
        return event.getValue();
    }

    @Test
    @DisplayName("dans une transaction, rien ne part avant le commit : la relecture de la mission trouverait l'état d'avant")
    void a_change_is_announced_after_the_commit_only() {
        TransactionSynchronizationManager.initSynchronization();
        run.setStatus(DeliveryRunStatus.DONE);
        run.setOutcome(DeliveryRunOutcome.APPLIED);
        ProjectRunResponse.Step handedOver = new ProjectRunResponse.Step("handover", 14, "tool", "Edit", at);
        when(steps.stepOf(run)).thenReturn(handedOver);

        feed.run(run);

        verify(messaging, never()).convertAndSend(anyString(), any(Object.class));
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        assertThat(sent()).isEqualTo(new ProjectDeliveryEvent("run", 12L, 100L, 55L, "DONE", "APPLIED", null, null, handedOver));
    }

    @Test
    @DisplayName("hors transaction, tout de suite, avec l'étape en cours de la mission")
    void outside_a_transaction_it_goes_at_once() {
        feed.run(run);

        assertThat(sent()).isEqualTo(new ProjectDeliveryEvent("run", 12L, 100L, 55L, "RUNNING", null, null, null, doing));
    }

    @Test
    @DisplayName("la réclamation d'un runner, faite en masse, s'annonce de ses identifiants, avec l'étape de la mission")
    void a_claim_is_announced_from_its_ids() {
        ProjectRunResponse.Step started = new ProjectRunResponse.Step("understand", null, null, null, null);
        when(steps.stepOfClaimed(100L, DeliveryRunStatus.RUNNING)).thenReturn(started);

        feed.run(12L, 100L, 55L, DeliveryRunStatus.RUNNING);

        assertThat(sent()).isEqualTo(new ProjectDeliveryEvent("run", 12L, 100L, 55L, "RUNNING", null, null, null, started));
    }

    @Test
    @DisplayName("une demande : laquelle, son état, et l'étape où elle met la mission ; jamais qui peut y répondre, que chacun relit")
    void a_request_says_which_one_its_state_and_the_step() {
        DeliveryRunApproval approval = DeliveryRunApproval.builder().id(9L).run(run).status(DeliveryApprovalStatus.PENDING).build();
        ProjectRunResponse.Step asked = new ProjectRunResponse.Step("handover", 14, "tool", "Edit", at);
        when(steps.stepOf(run)).thenReturn(asked);

        feed.approval(run, approval);

        assertThat(sent()).isEqualTo(new ProjectDeliveryEvent("approval", 12L, 100L, 55L, "RUNNING", null, 9L, "PENDING", asked));
    }

    @Test
    @DisplayName("une étape de plus : l'étape en cours, telle que la page des missions la montre")
    void a_step_carries_the_current_step() {
        DeliveryRunEvent event = DeliveryRunEvent.builder().run(run).seq(14).kind("tool").tool("Edit").text("src/footer.tsx").build();
        ReflectionTestUtils.setField(event, "createdAt", at);

        feed.step(run, event);

        assertThat(sent()).isEqualTo(new ProjectDeliveryEvent("step", 12L, 100L, 55L, "RUNNING", null, null, null, doing));
    }

    @Test
    @DisplayName("une étape qui ne se lit pas ne retient pas l'événement : il part sans elle, et l'écran relit la mission")
    void a_step_that_cannot_be_read_does_not_hold_the_event() {
        when(steps.stepOf(run)).thenThrow(new DataAccessResourceFailureException("database down"));

        assertThatCode(() -> feed.run(run)).doesNotThrowAnyException();
        assertThat(sent()).isEqualTo(new ProjectDeliveryEvent("run", 12L, 100L, 55L, "RUNNING", null, null, null, null));
    }

    @Test
    @DisplayName("une mission sans projet, ou ce qui n'est pas une mission, n'annonce rien et ne lit rien")
    void nothing_to_announce_without_a_project() {
        feed.run(DeliveryRun.builder().id(1L).issue(Issue.builder().id(2L).build()).build());
        feed.run(DeliveryRun.builder().id(1L).build());
        feed.run(null);
        feed.run(null, 100L, 55L, DeliveryRunStatus.RUNNING);
        feed.approval(run, null);
        feed.step(run, null);

        verifyNoInteractions(messaging);
        verify(steps, never()).stepOf(any());
        verify(steps, never()).stepOfClaimed(any(), any());
    }

    @Test
    @DisplayName("un broker en panne ne fait jamais échouer la mission")
    void a_broken_broker_never_fails_the_mission() {
        doThrow(new MessageDeliveryException("broker down")).when(messaging).convertAndSend(anyString(), any(Object.class));

        assertThatCode(() -> feed.run(run)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("le topic des missions est un flux du projet, à côté de son board et de ses analyses")
    void the_topic_is_one_of_the_project() {
        assertThat(ProjectDeliveryFeed.topic(12L)).isEqualTo("/topic/projects.12.delivery");
    }
}
