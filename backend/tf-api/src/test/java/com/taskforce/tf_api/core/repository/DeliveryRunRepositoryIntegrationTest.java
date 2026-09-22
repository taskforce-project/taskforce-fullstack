package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.hibernate.Hibernate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests d'intégration de {@link DeliveryRunRepository} contre un <b>vrai Postgres</b>.
 *
 * <p>Les tests unitaires de la délégation mockent ce repository : ils ne prouvent ni le JPQL, ni
 * l'atomicité. Or deux choses ne se vérifient qu'ici. La <b>liste du workspace</b> charge l'issue et son
 * projet dans la même requête (la réponse porte leur clé, leur titre et leur projet) sans déborder sur un
 * autre projet. Et la <b>file du runner local</b> (ADR-013) repose sur des mises à jour conditionnelles :
 * un seul runner gagne un claim, un signe de vie n'est accepté que du runner qui tient le run.</p>
 */
@DisplayName("DeliveryRunRepository (intégration Postgres)")
class DeliveryRunRepositoryIntegrationTest extends AbstractIntegrationTest {

    private static final String PROVIDER = "claude-code";

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private DeliveryRunRepository runRepository;
    @Autowired private TestEntityManager em;
    @Autowired private JdbcTemplate jdbc;

    private User pierre;
    private User mallory;
    private Project web;
    private Project api;
    private Issue webIssue;
    private Issue apiIssue;
    private int seq = 1;

    @BeforeEach
    void seed() {
        pierre = persistUser("pierre");
        mallory = persistUser("mallory");
        Workspace ws = workspaceRepository.save(
            Workspace.builder().name("IT Workspace").slug("ws-delivery-it").owner(pierre).build());
        web = projectRepository.save(
            Project.builder().workspace(ws).name("Website").identifier("WEB").createdBy(pierre).build());
        api = projectRepository.save(
            Project.builder().workspace(ws).name("API Platform").identifier("API").createdBy(pierre).build());
        webIssue = persistIssue(web, "Fix the footer links");
        apiIssue = persistIssue(api, "Rate limit the export");
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
            .sequenceNumber(seq++).title(title).priority(IssuePriority.MEDIUM).build());
    }

    /** Persiste un run puis fixe ses horodatages en SQL : l'ordre des listes ne dépend pas de l'horloge du test. */
    private DeliveryRun persistRun(Issue issue, String provider, DeliveryRunStatus status, User startedBy, int minutesAgo) {
        DeliveryRun run = runRepository.saveAndFlush(DeliveryRun.builder()
            .issue(issue).providerKey(provider).status(status).startedBy(startedBy).build());
        LocalDateTime at = LocalDateTime.now().minusMinutes(minutesAgo);
        jdbc.update("UPDATE delivery_runs SET created_at = ?, updated_at = ? WHERE id = ?", at, at, run.getId());
        return run;
    }

    // =========================================================================
    // Liste du workspace (historique des délégations, canvas)
    // =========================================================================

    @Test
    @DisplayName("findByProjectIds : borné aux projets donnés, le plus récent d'abord, issue et projet déjà chargés")
    void list_is_scoped_ordered_and_fetches_issue_and_project() {
        DeliveryRun older = persistRun(webIssue, PROVIDER, DeliveryRunStatus.DONE, pierre, 60);
        DeliveryRun newer = persistRun(webIssue, PROVIDER, DeliveryRunStatus.FAILED, pierre, 5);
        persistRun(apiIssue, "cursor", DeliveryRunStatus.RUNNING, pierre, 1); // autre projet : hors liste
        em.clear();

        List<DeliveryRun> runs = runRepository.findByProjectIds(List.of(web.getId()), PageRequest.of(0, 200));

        assertThat(runs).extracting(DeliveryRun::getId).containsExactly(newer.getId(), older.getId());
        DeliveryRun first = runs.get(0);
        // JOIN FETCH : lire la clé, le titre et le projet ne coûte aucune requête de plus par run.
        assertThat(Hibernate.isInitialized(first.getIssue())).isTrue();
        assertThat(Hibernate.isInitialized(first.getIssue().getProject())).isTrue();
        assertThat(first.getIssue().getTitle()).isEqualTo("Fix the footer links");
        assertThat(first.getIssue().getProject().getIdentifier()).isEqualTo("WEB");
    }

    @Test
    @DisplayName("findByProjectIds : le plafond de page s'applique")
    void list_respects_page_cap() {
        persistRun(webIssue, PROVIDER, DeliveryRunStatus.DONE, pierre, 30);
        persistRun(webIssue, PROVIDER, DeliveryRunStatus.DONE, pierre, 20);
        persistRun(webIssue, PROVIDER, DeliveryRunStatus.DONE, pierre, 10);
        em.clear();

        assertThat(runRepository.findByProjectIds(List.of(web.getId(), api.getId()), PageRequest.of(0, 2))).hasSize(2);
    }

    // =========================================================================
    // File du runner local (ADR-013)
    // =========================================================================

    @Test
    @DisplayName("findClaimable : seulement les runs en attente de CE provider, délégués par CE propriétaire, du plus ancien au plus récent")
    void claimable_is_scoped_to_provider_owner_and_status() {
        DeliveryRun second = persistRun(webIssue, PROVIDER, DeliveryRunStatus.QUEUED, pierre, 10);
        DeliveryRun first = persistRun(apiIssue, PROVIDER, DeliveryRunStatus.QUEUED, pierre, 40);
        persistRun(webIssue, PROVIDER, DeliveryRunStatus.QUEUED, mallory, 50);  // autre délégant
        persistRun(webIssue, "cursor", DeliveryRunStatus.QUEUED, pierre, 50);   // autre provider
        persistRun(webIssue, PROVIDER, DeliveryRunStatus.DONE, pierre, 50);     // déjà terminé
        em.clear();

        List<DeliveryRun> claimable = runRepository.findClaimable(
            PROVIDER, DeliveryRunStatus.QUEUED, pierre.getId(), PageRequest.of(0, 5));

        assertThat(claimable).extracting(DeliveryRun::getId).containsExactly(first.getId(), second.getId());
    }

    @Test
    @DisplayName("claim : un seul gagnant ; le run passe RUNNING avec son runner, son handle et ses horodatages")
    void claim_is_atomic_single_winner() {
        DeliveryRun run = persistRun(webIssue, PROVIDER, DeliveryRunStatus.QUEUED, pierre, 10);
        LocalDateTime now = LocalDateTime.now();

        int first = runRepository.claim(run.getId(), "tf-runner-pierre", "runner:tf-runner-pierre:abc", now,
            DeliveryRunStatus.QUEUED, DeliveryRunStatus.RUNNING);
        int second = runRepository.claim(run.getId(), "tf-runner-other", "runner:tf-runner-other:def", now,
            DeliveryRunStatus.QUEUED, DeliveryRunStatus.RUNNING);

        assertThat(first).isEqualTo(1);
        assertThat(second).isZero(); // déjà réclamé : le second runner ne prend rien, et n'écrase rien
        DeliveryRun claimed = runRepository.findById(run.getId()).orElseThrow();
        assertThat(claimed.getStatus()).isEqualTo(DeliveryRunStatus.RUNNING);
        assertThat(claimed.getClaimedBy()).isEqualTo("tf-runner-pierre");
        assertThat(claimed.getExternalRef()).isEqualTo("runner:tf-runner-pierre:abc");
        assertThat(claimed.getClaimedAt()).isNotNull();
        assertThat(claimed.getHeartbeatAt()).isNotNull();
        assertThat(runRepository.findByExternalRef("runner:tf-runner-pierre:abc")).isPresent();
        // Un run réclamé sort de la file.
        assertThat(runRepository.findClaimable(PROVIDER, DeliveryRunStatus.QUEUED, pierre.getId(), PageRequest.of(0, 5))).isEmpty();
    }

    @Test
    @DisplayName("heartbeat : accepté du runner qui tient le run, refusé d'un autre runner et sur un run terminé")
    void heartbeat_only_from_the_holder_while_running() {
        DeliveryRun run = persistRun(webIssue, PROVIDER, DeliveryRunStatus.QUEUED, pierre, 10);
        LocalDateTime claimedAt = LocalDateTime.now().minusMinutes(5);
        runRepository.claim(run.getId(), "tf-runner-pierre", "runner:x", claimedAt,
            DeliveryRunStatus.QUEUED, DeliveryRunStatus.RUNNING);

        LocalDateTime beat = LocalDateTime.now();
        assertThat(runRepository.heartbeat(run.getId(), "tf-runner-other", beat, DeliveryRunStatus.RUNNING)).isZero();
        assertThat(runRepository.heartbeat(run.getId(), "tf-runner-pierre", beat, DeliveryRunStatus.RUNNING)).isEqualTo(1);
        assertThat(runRepository.findById(run.getId()).orElseThrow().getHeartbeatAt()).isAfter(claimedAt);

        DeliveryRun done = runRepository.findById(run.getId()).orElseThrow();
        done.setStatus(DeliveryRunStatus.DONE);
        runRepository.saveAndFlush(done);
        assertThat(runRepository.heartbeat(run.getId(), "tf-runner-pierre", LocalDateTime.now(), DeliveryRunStatus.RUNNING)).isZero();
    }
}
