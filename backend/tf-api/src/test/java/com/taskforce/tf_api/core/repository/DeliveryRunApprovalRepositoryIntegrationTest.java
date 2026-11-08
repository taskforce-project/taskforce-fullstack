package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;

import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Notification;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ce qui attend vraiment une personne (R128, séance n°19), contre un <b>vrai Postgres</b> : le JPQL dit ce qu'est une
 * demande encore ouverte. Les notifications d'accord non lues disaient 16 là où il n'y avait aucune demande.
 */
@DisplayName("DeliveryRunApprovalRepository : les demandes ouvertes (intégration Postgres)")
class DeliveryRunApprovalRepositoryIntegrationTest extends AbstractIntegrationTest {

    /** Le délai au-delà duquel un runner sans signe de vie est tenu pour perdu. */
    private static final int HEARTBEAT_MINUTES = 10;

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private DeliveryRunRepository runRepository;
    @Autowired private DeliveryRunApprovalRepository approvalRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private TestEntityManager em;

    private User pierre;
    private User mallory;
    private Workspace workspace;
    private Project web;
    private Project api;
    private int sequence = 1;

    @BeforeEach
    void seed() {
        pierre = persistUser("pierre");
        mallory = persistUser("mallory");
        workspace = workspaceRepository.save(
            Workspace.builder().name("IT Workspace").slug("ws-approvals-it").owner(pierre).build());
        web = projectRepository.save(
            Project.builder().workspace(workspace).name("Website").identifier("WEB").createdBy(pierre).build());
        api = projectRepository.save(
            Project.builder().workspace(workspace).name("API").identifier("API").createdBy(pierre).build());
    }

    private User persistUser(String name) {
        return userRepository.save(User.builder()
            .keycloakId("kc-" + name).email(name + "@it.dev").displayName(name).isActive(true).build());
    }

    private Issue persistIssue(Project project, String title) {
        IssueStatus backlog = issueStatusRepository.save(IssueStatus.builder()
            .project(project).name("Backlog").category(IssueStatusCategory.BACKLOG).position((short) 0).build());
        return issueRepository.saveAndFlush(Issue.builder()
            .project(project).status(backlog).reporter(pierre)
            .sequenceNumber(sequence++).title(title).priority(IssuePriority.MEDIUM).build());
    }

    private DeliveryRun persistRun(Issue issue, DeliveryRunStatus status, User startedBy, LocalDateTime heartbeatAt) {
        return runRepository.saveAndFlush(DeliveryRun.builder()
            .issue(issue).providerKey("claude-code").status(status).startedBy(startedBy).heartbeatAt(heartbeatAt).build());
    }

    private void persistApproval(DeliveryRun run, DeliveryApprovalStatus status, LocalDateTime expiresAt) {
        approvalRepository.saveAndFlush(DeliveryRunApproval.builder()
            .run(run).tool("Bash").summary("npm install").status(status).expiresAt(expiresAt).build());
    }

    private List<DeliveryRunApprovalRepository.OpenRow> open(User person, List<Long> projectIds) {
        em.clear();
        LocalDateTime now = LocalDateTime.now();
        return approvalRepository.findOpen(projectIds, person.getId(), DeliveryApprovalStatus.PENDING, now,
            DeliveryRunStatus.RUNNING, now.minusMinutes(HEARTBEAT_MINUTES));
    }

    /** (ce qui se passe, l'état de la demande, son échéance en min, l'état du run, le dernier signe de vie en min, ouverte ?) */
    static Stream<Arguments> requests() {
        return Stream.of(
            Arguments.of("une demande sans réponse, sur une mission en vie", DeliveryApprovalStatus.PENDING, 5, DeliveryRunStatus.RUNNING, 1, true),
            Arguments.of("le runner n'a pas encore donné signe de vie", DeliveryApprovalStatus.PENDING, 5, DeliveryRunStatus.RUNNING, null, true),
            Arguments.of("accordée", DeliveryApprovalStatus.ALLOWED, 5, DeliveryRunStatus.RUNNING, 1, false),
            Arguments.of("refusée", DeliveryApprovalStatus.DENIED, 5, DeliveryRunStatus.RUNNING, 1, false),
            Arguments.of("refusée faute de réponse", DeliveryApprovalStatus.EXPIRED, 5, DeliveryRunStatus.RUNNING, 1, false),
            Arguments.of("son échéance est passée, personne ne l'a relue", DeliveryApprovalStatus.PENDING, -1, DeliveryRunStatus.RUNNING, 1, false),
            Arguments.of("la mission a fini", DeliveryApprovalStatus.PENDING, 5, DeliveryRunStatus.DONE, 1, false),
            Arguments.of("la mission a échoué", DeliveryApprovalStatus.PENDING, 5, DeliveryRunStatus.FAILED, 1, false),
            Arguments.of("le runner a disparu : plus de signe de vie depuis le délai", DeliveryApprovalStatus.PENDING, 5, DeliveryRunStatus.RUNNING, HEARTBEAT_MINUTES + 1, false));
    }

    @ParameterizedTest(name = "{0} : ouverte = {5}")
    @MethodSource("requests")
    @DisplayName("seule une demande à laquelle une réponse peut encore servir compte")
    void only_a_request_that_can_still_be_answered_counts(String what, DeliveryApprovalStatus status, int expiresIn,
                                                          DeliveryRunStatus runStatus, Integer heartbeatMinutesAgo, boolean open) {
        LocalDateTime heartbeat = heartbeatMinutesAgo == null ? null : LocalDateTime.now().minusMinutes(heartbeatMinutesAgo);
        persistApproval(persistRun(persistIssue(web, what), runStatus, pierre, heartbeat), status, LocalDateTime.now().plusMinutes(expiresIn));

        assertThat(open(pierre, List.of(web.getId()))).hasSize(open ? 1 : 0);
    }

    @Test
    @DisplayName("une ligne par mission, avec le nombre de ses demandes ouvertes et son issue ; celle qui attend depuis le plus longtemps d'abord")
    void one_row_per_mission_with_its_count_the_oldest_first() {
        Issue first = persistIssue(web, "Fix the footer");
        Issue second = persistIssue(api, "Rate limit the export");
        DeliveryRun older = persistRun(first, DeliveryRunStatus.RUNNING, pierre, LocalDateTime.now());
        persistApproval(older, DeliveryApprovalStatus.PENDING, LocalDateTime.now().plusMinutes(5));
        persistApproval(older, DeliveryApprovalStatus.PENDING, LocalDateTime.now().plusMinutes(6));
        persistApproval(older, DeliveryApprovalStatus.ALLOWED, LocalDateTime.now().plusMinutes(6));
        persistApproval(persistRun(second, DeliveryRunStatus.RUNNING, pierre, LocalDateTime.now()),
            DeliveryApprovalStatus.PENDING, LocalDateTime.now().plusMinutes(5));

        List<DeliveryRunApprovalRepository.OpenRow> rows = open(pierre, List.of(web.getId(), api.getId()));

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getRunId()).isEqualTo(older.getId());
        assertThat(rows.get(0).getRequests()).isEqualTo(2);
        assertThat(rows.get(0).getIssueId()).isEqualTo(first.getId());
        assertThat(rows.get(0).getIssueTitle()).isEqualTo("Fix the footer");
        assertThat(rows.get(0).getProjectId()).isEqualTo(web.getId());
        assertThat(rows.get(0).getProjectIdentifier()).isEqualTo("WEB");
        assertThat(rows.get(0).getSequenceNumber()).isEqualTo(first.getSequenceNumber());
        assertThat(rows.get(1).getRequests()).isEqualTo(1);
    }

    @Test
    @DisplayName("une personne ne voit que ce qui lui est demandé, sur les projets qu'elle voit")
    void a_person_only_sees_what_is_asked_of_her_on_the_projects_she_sees() {
        persistApproval(persistRun(persistIssue(web, "Fix the footer"), DeliveryRunStatus.RUNNING, pierre, LocalDateTime.now()),
            DeliveryApprovalStatus.PENDING, LocalDateTime.now().plusMinutes(5));

        assertThat(open(mallory, List.of(web.getId()))).as("une autre personne").isEmpty();
        assertThat(open(pierre, List.of(api.getId()))).as("un projet qu'elle ne voit pas").isEmpty();
    }

    @Test
    @DisplayName("markReadForIssue : seulement les notifications d'accord de cette issue et de cette personne")
    void notifications_of_an_issue_are_read_for_one_person_and_one_type() {
        Notification approval = persistNotification(pierre, "WEB-1", "agentApproval");
        Notification mention = persistNotification(pierre, "WEB-1", "mention");
        Notification otherIssue = persistNotification(pierre, "WEB-2", "agentApproval");
        Notification otherPerson = persistNotification(mallory, "WEB-1", "agentApproval");

        assertThat(notificationRepository.markReadForIssue(pierre.getId(), "WEB-1", "agentApproval")).isEqualTo(1);

        em.flush();
        em.clear();
        assertThat(read(approval)).isTrue();
        assertThat(read(mention)).isFalse();
        assertThat(read(otherIssue)).isFalse();
        assertThat(read(otherPerson)).isFalse();
    }

    private Notification persistNotification(User recipient, String issueIdentifier, String type) {
        return notificationRepository.saveAndFlush(Notification.builder()
            .recipient(recipient).workspace(workspace).type(type).urgency("warning").title("A title")
            .issueIdentifier(issueIdentifier).issueUrl("/ws/projects/1/issues/1").projectName("Website").projectUrl("/ws/projects/1")
            .build());
    }

    private boolean read(Notification notification) {
        return notificationRepository.findById(notification.getId()).orElseThrow().isRead();
    }
}
