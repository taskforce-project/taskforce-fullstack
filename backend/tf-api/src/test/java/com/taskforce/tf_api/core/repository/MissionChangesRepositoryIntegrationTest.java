package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.data.domain.PageRequest;

import com.taskforce.tf_api.core.enums.DeliveryCommandKind;
import com.taskforce.tf_api.core.enums.DeliveryCommandStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunChange;
import com.taskforce.tf_api.core.model.DeliveryRunCommand;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Les changements d'une mission contre un <b>vrai Postgres</b> (R139, V122) : les tests unitaires mockent ces repositories,
 * ils ne prouvent ni le JPQL, ni la mise à jour conditionnelle qui fait qu'un ordre n'est remis qu'une fois, ni la colonne
 * JSON des commentaires.
 */
@DisplayName("Changements d'une mission (intégration Postgres)")
class MissionChangesRepositoryIntegrationTest extends AbstractIntegrationTest {

    private static final String RUNNER = "tf-runner-pierre";

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private DeliveryRunRepository runRepository;
    @Autowired private DeliveryRunChangeRepository changes;
    @Autowired private DeliveryRunCommandRepository commands;
    @Autowired private TestEntityManager em;

    private User pierre;
    private User mallory;
    private DeliveryRun run;

    @BeforeEach
    void seed() {
        pierre = userRepository.save(User.builder().keycloakId("kc-p").email("pierre@it.dev").displayName("p").isActive(true).build());
        mallory = userRepository.save(User.builder().keycloakId("kc-m").email("mallory@it.dev").displayName("m").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("IT").slug("ws-changes-it").owner(pierre).build());
        Project project = projectRepository.save(Project.builder().workspace(ws).name("Website").identifier("WEB").createdBy(pierre).build());
        IssueStatus backlog = issueStatusRepository.save(IssueStatus.builder()
            .project(project).name("Backlog").category(IssueStatusCategory.BACKLOG).position((short) 0).build());
        Issue issue = issueRepository.saveAndFlush(Issue.builder()
            .project(project).status(backlog).reporter(pierre).sequenceNumber(1).title("Fix").priority(IssuePriority.MEDIUM).build());
        run = runRepository.saveAndFlush(DeliveryRun.builder()
            .issue(issue).providerKey("claude-code").status(DeliveryRunStatus.DONE).startedBy(pierre).claimedBy(RUNNER).build());
    }

    private DeliveryRunChange change(String path, Integer added, String body) {
        return changes.saveAndFlush(DeliveryRunChange.builder().run(run).path(path).status("modified").added(added).removed(1)
            .revision("r1").body(body).updatedAt(LocalDateTime.now()).build());
    }

    private DeliveryRunCommand command(DeliveryRun target, String path) {
        return commands.saveAndFlush(DeliveryRunCommand.builder().run(target).kind(DeliveryCommandKind.REVERT_FILE).path(path)
            .requestedBy(pierre).createdAt(LocalDateTime.now()).build());
    }

    @Test
    @DisplayName("la liste se lit sans les textes, dans l'ordre des chemins ; un binaire n'a pas de lignes")
    void lists_rows() {
        change("b.txt", 2, "x".repeat(10_000));
        change("a.txt", null, null);

        List<DeliveryRunChangeRepository.Row> rows = changes.listRows(run.getId());

        assertThat(rows).extracting(DeliveryRunChangeRepository.Row::path).containsExactly("a.txt", "b.txt");
        assertThat(rows.get(0).added()).isNull();
        assertThat(rows.get(1).added()).isEqualTo(2);
    }

    @Test
    @DisplayName("un fichier qui n'est plus dans le relevé s'en va, et lui seul")
    void deletes_gone_files() {
        change("a.txt", 1, "a");
        change("b.txt", 1, "b");

        assertThat(changes.deleteByRunIdAndPathIn(run.getId(), Set.of("a.txt"))).isEqualTo(1);
        em.clear();

        assertThat(changes.listRows(run.getId())).extracting(DeliveryRunChangeRepository.Row::path).containsExactly("b.txt");
        assertThat(changes.existsByRunIdAndPath(run.getId(), "a.txt")).isFalse();
        assertThat(changes.findByRunIdAndPath(run.getId(), "b.txt").orElseThrow().getBody()).isEqualTo("b");
    }

    @Test
    @DisplayName("un ordre ne se prend qu'une fois")
    void takes_a_command_once() {
        DeliveryRunCommand revert = command(run, "a.txt");
        LocalDateTime now = LocalDateTime.now();

        assertThat(commands.take(revert.getId(), now, DeliveryCommandStatus.PENDING, DeliveryCommandStatus.RUNNING)).isEqualTo(1);
        assertThat(commands.take(revert.getId(), now, DeliveryCommandStatus.PENDING, DeliveryCommandStatus.RUNNING)).isZero();
        em.clear();

        assertThat(commands.findById(revert.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryCommandStatus.RUNNING);
    }

    @Test
    @DisplayName("un runner ne voit que les ordres des missions qu'il a portées, déléguées par son propriétaire")
    void pending_commands_are_scoped() {
        DeliveryRunCommand mine = command(run, "a.txt");
        DeliveryRun other = runRepository.saveAndFlush(DeliveryRun.builder().issue(run.getIssue()).providerKey("claude-code")
            .status(DeliveryRunStatus.DONE).startedBy(mallory).claimedBy("tf-runner-mallory").build());
        command(other, "b.txt");
        em.clear();

        assertThat(commands.findPending(DeliveryCommandStatus.PENDING, RUNNER, pierre.getId(), PageRequest.of(0, 5)))
            .extracting(DeliveryRunCommand::getId).containsExactly(mine.getId());
        assertThat(commands.findPending(DeliveryCommandStatus.PENDING, RUNNER, mallory.getId(), PageRequest.of(0, 5))).isEmpty();
    }

    @Test
    @DisplayName("seul un ordre en attente ou en cours compte comme tel")
    void active_commands() {
        DeliveryRunCommand revert = command(run, "a.txt");
        Set<DeliveryCommandStatus> active = Set.of(DeliveryCommandStatus.PENDING, DeliveryCommandStatus.RUNNING);
        assertThat(commands.existsByRunIdAndPathAndStatusIn(run.getId(), "a.txt", active)).isTrue();
        assertThat(commands.existsByRunIdAndStatusIn(run.getId(), active)).isTrue();

        revert.setStatus(DeliveryCommandStatus.DONE);
        commands.saveAndFlush(revert);

        assertThat(commands.existsByRunIdAndPathAndStatusIn(run.getId(), "a.txt", active)).isFalse();
    }

    @Test
    @DisplayName("les commentaires d'une reprise et son lien à la mission d'avant se gardent")
    void follow_up_is_stored() {
        DeliveryRun followUp = runRepository.saveAndFlush(DeliveryRun.builder().issue(run.getIssue()).providerKey("claude-code")
            .status(DeliveryRunStatus.QUEUED).startedBy(pierre).parentRun(run).branch("tf/web-1-r1").baseSha("a".repeat(40))
            .followUp(List.of(Map.of("path", "src/a.ts", "line", 12, "side", "new", "text", "Use the helper"))).build());
        em.clear();

        DeliveryRun read = runRepository.findById(followUp.getId()).orElseThrow();

        assertThat(read.getParentRun().getId()).isEqualTo(run.getId());
        assertThat(read.getFollowUp().get(0)).containsEntry("path", "src/a.ts").containsEntry("line", 12);
    }
}
