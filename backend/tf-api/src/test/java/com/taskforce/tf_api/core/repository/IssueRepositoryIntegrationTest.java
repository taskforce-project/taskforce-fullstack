package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests d'intégration (B-T5) — {@link IssueRepository}, requêtes custom contre un <b>vrai Postgres</b>.
 *
 * <p>Cible précisément les requêtes que les tests unitaires B-T1/B-T2 ne pouvaient que <b>mocker</b>
 * (le {@code JdbcTemplate}/repository était simulé) : {@code findByWorkspaceSlugAndAssigneeId}
 * (charge cross-projets du Smart Assign) et {@code countOpenIssuesGroupedByAssignee}
 * (détection de surcharge de la Redistribution). Ici le JPQL réel s'exécute → valide la sémantique
 * (filtre workspace, exclusion COMPLETED/CANCELLED, regroupement par assigné).</p>
 */
@DisplayName("IssueRepository (intégration Postgres)")
class IssueRepositoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;

    private static final String SLUG = "ws-it";

    private User alice;
    private User bob;
    private Project project;
    private IssueStatus backlog;   // ouvert
    private IssueStatus started;   // ouvert
    private IssueStatus done;      // COMPLETED → exclu
    private IssueStatus cancelled; // CANCELLED → exclu

    private int seq = 1;

    @BeforeEach
    void seed() {
        User owner = persistUser("owner");
        alice = persistUser("alice");
        bob = persistUser("bob");

        Workspace ws = workspaceRepository.save(
            Workspace.builder().name("IT Workspace").slug(SLUG).owner(owner).build());
        project = projectRepository.save(
            Project.builder().workspace(ws).name("Infra").identifier("INF").createdBy(owner).build());

        backlog = persistStatus("Backlog", IssueStatusCategory.BACKLOG, 0);
        started = persistStatus("In Progress", IssueStatusCategory.STARTED, 1);
        done = persistStatus("Done", IssueStatusCategory.COMPLETED, 2);
        cancelled = persistStatus("Cancelled", IssueStatusCategory.CANCELLED, 3);

        // Deuxième workspace + projet + issue Alice → ne doit JAMAIS remonter pour SLUG.
        User otherOwner = persistUser("other");
        Workspace otherWs = workspaceRepository.save(
            Workspace.builder().name("Other").slug("ws-other").owner(otherOwner).build());
        Project otherProject = projectRepository.save(
            Project.builder().workspace(otherWs).name("X").identifier("X").createdBy(otherOwner).build());
        IssueStatus otherBacklog = issueStatusRepository.save(IssueStatus.builder()
            .project(otherProject).name("Backlog").category(IssueStatusCategory.BACKLOG).build());
        issueRepository.saveAndFlush(issue(otherProject, otherBacklog, alice, "hors-workspace"));
    }

    private User persistUser(String name) {
        return userRepository.save(User.builder()
            .keycloakId("kc-" + name).email(name + "@it.dev").displayName(name).isActive(true).build());
    }

    private IssueStatus persistStatus(String name, IssueStatusCategory category, int position) {
        return issueStatusRepository.save(IssueStatus.builder()
            .project(project).name(name).category(category).position((short) position).build());
    }

    private Issue issue(Project p, IssueStatus status, User assignee, String title) {
        return Issue.builder()
            .project(p).status(status).assignee(assignee).reporter(assignee)
            .sequenceNumber(seq++).title(title).priority(IssuePriority.MEDIUM).storyPoints(3)
            .build();
    }

    private void persist(IssueStatus status, User assignee, String title) {
        issueRepository.saveAndFlush(issue(project, status, assignee, title));
    }

    // =========================================================================
    @Test
    @DisplayName("findByWorkspaceSlugAndAssigneeId ne renvoie que les issues de l'assigné dans CE workspace")
    void should_return_only_assignee_issues_in_workspace() {
        persist(backlog, alice, "A1");
        persist(started, alice, "A2");
        persist(backlog, bob, "B1"); // autre assigné

        List<Issue> aliceIssues = issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, alice.getId());

        assertThat(aliceIssues).extracting(Issue::getTitle)
            .containsExactlyInAnyOrder("A1", "A2");   // pas "B1", pas "hors-workspace"
        assertThat(aliceIssues).allSatisfy(i ->
            assertThat(i.getProject().getWorkspace().getSlug()).isEqualTo(SLUG));

        List<Issue> bobIssues = issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, bob.getId());
        assertThat(bobIssues).extracting(Issue::getTitle).containsExactly("B1");
    }

    @Test
    @DisplayName("findByWorkspaceSlugAndAssigneeId trie par sequenceNumber décroissant")
    void should_order_by_sequence_desc() {
        persist(backlog, alice, "first");
        persist(backlog, alice, "second");
        persist(backlog, alice, "third");

        List<Issue> issues = issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, alice.getId());

        assertThat(issues).extracting(Issue::getTitle).containsExactly("third", "second", "first");
    }

    @Test
    @DisplayName("countOpenIssuesGroupedByAssignee exclut COMPLETED/CANCELLED et regroupe par assigné")
    void should_count_open_issues_excluding_terminal_states() {
        // Alice : 2 ouvertes (backlog + started) + 1 done + 1 cancelled → compte = 2
        persist(backlog, alice, "A-open1");
        persist(started, alice, "A-open2");
        persist(done, alice, "A-done");
        persist(cancelled, alice, "A-cancelled");
        // Bob : 1 ouverte → compte = 1
        persist(backlog, bob, "B-open");

        List<Object[]> rows = issueRepository.countOpenIssuesGroupedByAssignee(List.of(project.getId()));

        Map<Long, Long> countByUser = rows.stream().collect(Collectors.toMap(
            r -> ((Number) r[0]).longValue(),
            r -> ((Number) r[1]).longValue()));

        assertThat(countByUser).containsEntry(alice.getId(), 2L);
        assertThat(countByUser).containsEntry(bob.getId(), 1L);
    }

    @Test
    @DisplayName("countOpenIssuesGroupedByAssignee renvoie vide quand toutes les issues sont terminées")
    void should_return_empty_when_all_terminal() {
        persist(done, alice, "done1");
        persist(cancelled, bob, "cancelled1");

        List<Object[]> rows = issueRepository.countOpenIssuesGroupedByAssignee(List.of(project.getId()));

        assertThat(rows).isEmpty();
    }
}
