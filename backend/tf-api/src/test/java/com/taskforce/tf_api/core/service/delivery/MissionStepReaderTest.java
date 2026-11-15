package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.response.DeliveryRunActivityResponse;
import com.taskforce.tf_api.core.dto.response.ProjectRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.DeliveryRunApprovalRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunEventRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * L'étape en cours des missions, que la vue du workflow montre (R166) : de leur chronologie, avec les demandes qui
 * attendent encore une réponse ; les règles, elles, sont celles du contrat ({@link MissionStepsContractTest}).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("MissionStepReader : l'étape en cours des missions")
class MissionStepReaderTest {

    @Mock private DeliveryRunEventRepository eventRepository;
    @Mock private DeliveryRunApprovalRepository approvalRepository;

    private MissionStepReader reader;

    private final Issue issue = Issue.builder().id(55L).project(Project.builder().id(12L).build()).build();

    @BeforeEach
    void setUp() {
        // Un runner sans signe de vie depuis plus de 10 minutes est tenu pour perdu.
        LocalRunnerSettings settings = new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15, 10);
        reader = new MissionStepReader(eventRepository, approvalRepository, settings);
    }

    private DeliveryRun run(long id, DeliveryRunStatus status, LocalDateTime heartbeatAt) {
        return DeliveryRun.builder().id(id).issue(issue).status(status).heartbeatAt(heartbeatAt).build();
    }

    private static LocalDateTime at(int minute) {
        return LocalDateTime.of(2026, 11, 14, 10, minute);
    }

    private static DeliveryRunEvent event(DeliveryRun run, int seq, String kind, String tool, String text) {
        DeliveryRunEvent event = DeliveryRunEvent.builder().run(run).seq(seq).kind(kind).tool(tool).text(text).build();
        ReflectionTestUtils.setField(event, "createdAt", at(seq));
        return event;
    }

    private static DeliveryRunApproval request(DeliveryRun run, String tool, String summary, LocalDateTime expiresAt) {
        return DeliveryRunApproval.builder().id(9L).run(run).tool(tool).summary(summary)
            .status(DeliveryApprovalStatus.PENDING).expiresAt(expiresAt).build();
    }

    private static DeliveryRunActivityResponse.Approval shown(String tool, String summary) {
        return new DeliveryRunActivityResponse.Approval(9L, tool, summary, "PENDING", null, null, null, null, true, "runner",
            null, null, null, null);
    }

    @Test
    @DisplayName("une mission en cours : l'étape de sa chronologie, avec son dernier événement")
    void a_mission_at_work_is_at_the_step_of_its_timeline() {
        DeliveryRun run = run(100L, DeliveryRunStatus.RUNNING, LocalDateTime.now());
        when(eventRepository.findByRunIdOrderBySeqAsc(100L)).thenReturn(List.of(
            event(run, 1, "tool", "Read", "a.ts"), event(run, 2, "tool", "Edit", "a.ts")));

        assertThat(reader.stepOf(run)).isEqualTo(new ProjectRunResponse.Step("do", 2, "tool", "Edit", at(2)));
    }

    @Test
    @DisplayName("une demande qui attend place la mission à l'étape de ce qu'elle demande")
    void an_open_request_places_the_mission_at_what_it_asks() {
        DeliveryRun run = run(100L, DeliveryRunStatus.RUNNING, LocalDateTime.now().minusMinutes(2));
        when(eventRepository.findByRunIdOrderBySeqAsc(100L)).thenReturn(List.of(event(run, 1, "tool", "Edit", "a.ts")));
        when(approvalRepository.findByRunIdInAndStatusOrderByCreatedAtAsc(List.of(100L), DeliveryApprovalStatus.PENDING))
            .thenReturn(List.of(request(run, "git push", "Push the branch tf/web-4", LocalDateTime.now().plusMinutes(5))));

        assertThat(reader.stepOf(run).key()).isEqualTo(MissionSteps.HANDOVER);
    }

    @Test
    @DisplayName("une demande échue ne compte plus ; celles d'une mission dont le runner s'est tu ne se lisent pas")
    void a_due_request_or_a_lost_runner_does_not_count() {
        DeliveryRun run = run(100L, DeliveryRunStatus.RUNNING, LocalDateTime.now());
        when(eventRepository.findByRunIdOrderBySeqAsc(100L)).thenReturn(List.of(event(run, 1, "tool", "Edit", "a.ts")));
        when(approvalRepository.findByRunIdInAndStatusOrderByCreatedAtAsc(List.of(100L), DeliveryApprovalStatus.PENDING))
            .thenReturn(List.of(request(run, "git push", "Push the branch tf/web-4", LocalDateTime.now().minusSeconds(1))));
        assertThat(reader.stepOf(run).key()).isEqualTo(MissionSteps.DO);

        DeliveryRun lost = run(101L, DeliveryRunStatus.RUNNING, LocalDateTime.now().minusMinutes(11));
        when(eventRepository.findByRunIdOrderBySeqAsc(101L)).thenReturn(List.of());
        assertThat(reader.stepOf(lost)).isEqualTo(new ProjectRunResponse.Step(MissionSteps.UNDERSTAND, null, null, null, null));
        verify(approvalRepository, never()).findByRunIdInAndStatusOrderByCreatedAtAsc(List.of(101L), DeliveryApprovalStatus.PENDING);
    }

    @Test
    @DisplayName("une mission rendue est à « rendre » ; une mission finie en échec, là où elle s'est arrêtée, sans ses demandes")
    void an_ended_mission_is_where_it_ended() {
        DeliveryRun delivered = run(100L, DeliveryRunStatus.DONE, null);
        when(eventRepository.findByRunIdOrderBySeqAsc(100L)).thenReturn(List.of(event(delivered, 1, "tool", "Read", "a.ts")));
        assertThat(reader.stepOf(delivered).key()).isEqualTo(MissionSteps.HANDOVER);

        DeliveryRun failed = run(101L, DeliveryRunStatus.FAILED, LocalDateTime.now());
        when(eventRepository.findByRunIdOrderBySeqAsc(101L)).thenReturn(List.of(
            event(failed, 1, "tool", "Edit", "a.ts"), event(failed, 2, "tool", "Bash", "npm test")));
        assertThat(reader.stepOf(failed).key()).isEqualTo(MissionSteps.CHECK);
        verifyNoInteractions(approvalRepository);
    }

    @Test
    @DisplayName("la réclamation d'un runner, faite en masse : la mission est en cours, ses demandes comptent")
    void a_claimed_mission_counts_its_requests() {
        DeliveryRun run = run(100L, DeliveryRunStatus.RUNNING, null);
        when(eventRepository.findByRunIdOrderBySeqAsc(100L)).thenReturn(List.of());
        when(approvalRepository.findByRunIdInAndStatusOrderByCreatedAtAsc(List.of(100L), DeliveryApprovalStatus.PENDING))
            .thenReturn(List.of(request(run, "Run the project's tests", "npm test", LocalDateTime.now().plusMinutes(5))));

        assertThat(reader.stepOfClaimed(100L, DeliveryRunStatus.RUNNING))
            .isEqualTo(new ProjectRunResponse.Step(MissionSteps.CHECK, null, null, null, null));
    }

    @Test
    @DisplayName("une page : les chronologies se lisent en une requête, une mission rendue sans la sienne, avec les demandes que la page montre")
    void a_page_reads_its_timelines_at_once() {
        DeliveryRun working = run(100L, DeliveryRunStatus.RUNNING, LocalDateTime.now());
        DeliveryRun failed = run(90L, DeliveryRunStatus.FAILED, null);
        DeliveryRun delivered = run(80L, DeliveryRunStatus.DONE, null);
        DeliveryRun queued = run(70L, DeliveryRunStatus.QUEUED, null);
        when(eventRepository.findLastByRunIds(List.of(80L))).thenReturn(List.of(event(delivered, 30, "exit", "gh pr create", "opened")));
        when(eventRepository.findByRunIdInOrderByRunIdAscSeqAsc(List.of(100L, 90L, 70L))).thenReturn(List.of(
            event(failed, 1, "tool", "Read", "a.ts"), event(failed, 2, "tool", "TodoWrite", "{}"),
            event(working, 1, "tool", "Edit", "a.ts")));
        Map<Long, List<DeliveryRunActivityResponse.Approval>> open = Map.of(100L, List.of(shown("Run the project's tests", "npm test")));

        Map<Long, ProjectRunResponse.Step> steps = reader.stepsOf(List.of(working, failed, delivered, queued), open);

        assertThat(steps).containsOnlyKeys(100L, 90L, 80L, 70L);
        assertThat(steps.get(100L)).isEqualTo(new ProjectRunResponse.Step(MissionSteps.CHECK, 1, "tool", "Edit", at(1)));
        assertThat(steps.get(90L)).isEqualTo(new ProjectRunResponse.Step(MissionSteps.PLAN, 2, "tool", "TodoWrite", at(2)));
        assertThat(steps.get(80L)).isEqualTo(new ProjectRunResponse.Step(MissionSteps.HANDOVER, 30, "exit", "gh pr create", at(30)));
        assertThat(steps.get(70L)).isEqualTo(new ProjectRunResponse.Step(MissionSteps.UNDERSTAND, null, null, null, null));
        // Les demandes sont celles que la page montre déjà : rien ne se relit.
        verifyNoInteractions(approvalRepository);
        verify(eventRepository, never()).findByRunIdOrderBySeqAsc(any());
    }

    @Test
    @DisplayName("une page vide ne lit rien")
    void an_empty_page_reads_nothing() {
        assertThat(reader.stepsOf(List.of(), Map.of())).isEmpty();
        verifyNoInteractions(eventRepository, approvalRepository);
    }
}
