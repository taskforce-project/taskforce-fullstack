package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvent;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Les chronologies des missions, contre un vrai Postgres : l'étape en cours d'une mission se lit de toute sa chronologie
 * (R166), et celles d'une page de missions se lisent en une requête, mission par mission, chacune dans l'ordre.
 */
@DisplayName("DeliveryRunEventRepository : les chronologies des missions (intégration Postgres)")
class DeliveryRunEventRepositoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private DeliveryRunRepository runRepository;
    @Autowired private DeliveryRunEventRepository eventRepository;
    @Autowired private TestEntityManager em;

    @Test
    @DisplayName("les chronologies d'une page en une requête : mission par mission, chacune dans l'ordre de ses événements")
    void the_timelines_of_a_page_read_at_once() {
        User pierre = userRepository.save(User.builder()
            .keycloakId("kc-events-it").email("events@it.dev").displayName("events").isActive(true).build());
        Workspace workspace = workspaceRepository.save(
            Workspace.builder().name("IT Events").slug("ws-events-it").owner(pierre).build());
        Project web = projectRepository.save(
            Project.builder().workspace(workspace).name("Website").identifier("WEB").createdBy(pierre).build());
        IssueStatus backlog = issueStatusRepository.save(IssueStatus.builder()
            .project(web).name("Backlog").category(IssueStatusCategory.BACKLOG).position((short) 0).build());
        Issue issue = issueRepository.saveAndFlush(Issue.builder()
            .project(web).status(backlog).reporter(pierre).sequenceNumber(1).title("Fix the footer").priority(IssuePriority.MEDIUM).build());
        DeliveryRun failed = persistRun(issue, DeliveryRunStatus.FAILED, pierre);
        DeliveryRun working = persistRun(issue, DeliveryRunStatus.RUNNING, pierre);
        DeliveryRun other = persistRun(issue, DeliveryRunStatus.RUNNING, pierre);
        // Écrits dans le désordre : la lecture remet l'ordre.
        persistEvent(working, 2, "tool", "Edit");
        persistEvent(failed, 2, "tool", "Bash");
        persistEvent(working, 1, "start", null);
        persistEvent(other, 1, "tool", "Read");
        persistEvent(failed, 1, "tool", "Read");
        em.clear();

        List<DeliveryRunEvent> page = eventRepository.findByRunIdInOrderByRunIdAscSeqAsc(List.of(working.getId(), failed.getId()));

        assertThat(page).extracting(e -> e.getRun().getId() + ":" + e.getSeq()).containsExactly(
            failed.getId() + ":1", failed.getId() + ":2", working.getId() + ":1", working.getId() + ":2");
        assertThat(eventRepository.findByRunIdOrderBySeqAsc(working.getId()))
            .extracting(DeliveryRunEvent::getKind).containsExactly("start", "tool");
        assertThat(eventRepository.findByRunIdOrderBySeqAsc(-1L)).isEmpty();
    }

    private DeliveryRun persistRun(Issue issue, DeliveryRunStatus status, User startedBy) {
        return runRepository.saveAndFlush(DeliveryRun.builder()
            .issue(issue).providerKey("claude-code").status(status).startedBy(startedBy).build());
    }

    private void persistEvent(DeliveryRun run, int seq, String kind, String tool) {
        eventRepository.saveAndFlush(DeliveryRunEvent.builder().run(run).seq(seq).kind(kind).tool(tool).text("...").build());
    }
}
