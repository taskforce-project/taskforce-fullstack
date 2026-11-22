package com.taskforce.tf_api.core.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.delivery.DeliveryPoll;
import com.taskforce.tf_api.core.service.delivery.MissionEvidenceService;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * Le dossier d'une mission contre un vrai Postgres, avec ses migrations (V135) : il survit à la suppression de son issue
 * (rien ne cascade), il s'exporte et se vérifie encore après elle, et la base refuse de modifier ou d'effacer un de ses
 * événements ou de ses sceaux, comme elle le refuse aux versions des règles. Il ne part qu'avec son espace de travail.
 */
@Import({MissionEvidenceService.class, EvidenceSigner.class, HarnessRulesService.class})
@DisplayName("Le dossier d'une mission survit à son issue (intégration Postgres)")
class MissionDossierIntegrationTest extends AbstractIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private DeliveryRunRepository runRepository;
    @Autowired private MissionDossierRepository dossiers;
    @Autowired private MissionEvidenceService evidence;
    @Autowired private HarnessRulesService rules;
    @Autowired private TestEntityManager em;
    @Autowired private JdbcTemplate jdbc;

    private User ada;
    private Workspace workspace;
    private Issue issue;
    private DeliveryRun run;

    @BeforeEach
    void seed() {
        ada = userRepository.save(User.builder().keycloakId("kc-ada").email("ada@it.dev").displayName("Ada").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("IT Dossier").slug("ws-dossier-it").owner(ada).build());
        Project project = projectRepository.save(Project.builder().workspace(workspace).name("Website").identifier("WEB")
            .createdBy(ada).build());
        IssueStatus backlog = issueStatusRepository.save(IssueStatus.builder().project(project).name("Backlog")
            .category(IssueStatusCategory.BACKLOG).position((short) 0).build());
        issue = issueRepository.saveAndFlush(Issue.builder().project(project).status(backlog).reporter(ada).sequenceNumber(1)
            .title("Fix the footer links").description("They point to the old site.").priority(IssuePriority.MEDIUM).build());
        run = runRepository.saveAndFlush(DeliveryRun.builder().issue(issue).providerKey("claude-code").model("sonnet")
            .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada").origin("app").build());
    }

    /** Une mission de bout en bout : la demande, le brief, l'agent lancé, une décision, un trou, la fin, un geste. */
    private void mission() {
        RulesBundle bundle = rules.bundleFor(workspace, new HarnessRulesService.Work(issue.getProject().getId(), null, ada.getId()));
        evidence.open(run, bundle, "tf-runner-ada", Map.of());
        evidence.runnerEvent(run, new RunnerEventsRequest.Event("brief", null, "The brief", null, null, 1, null, null, null,
            "You are working on a task delegated from TaskForce: WEB-1", null, null));
        evidence.runnerEvent(run, new RunnerEventsRequest.Event("agent", null, "Claude Code 2.1.300", null, null, 2, null, null,
            null, null, new RunnerEventsRequest.Agent("2.1.300", "claude-sonnet-5-20261001", null, "anthropic"), null));
        evidence.runnerEvent(run, new RunnerEventsRequest.Event("decision", "Read", "src/footer.tsx", "allow", "read-files", 3,
            List.of(Map.of("action", "file.read", "tool", "Read", "path", "src/footer.tsx")), "sha256:" + "e".repeat(64), null,
            null, null, null));
        evidence.runnerEvent(run, new RunnerEventsRequest.Event("tool", "Edit", "src/footer.tsx", null, null, 5, null, null, null,
            null, null, null));
        evidence.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "## What I did\nThe footer links.", null, null));
        evidence.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", "ada@it.dev"),
            Map.of("decision", "MARK_DONE", "where", "taskforce"));
        em.flush();
        em.clear();
    }

    private JsonNode export() throws Exception {
        return JSON.readTree(evidence.dossierJson(run.getId()).orElseThrow());
    }

    private static List<ObjectNode> events(JsonNode file) {
        List<ObjectNode> events = new ArrayList<>();
        file.get("events").forEach(e -> events.add((ObjectNode) e));
        return events;
    }

    @Test
    @DisplayName("une mission de bout en bout : le dossier exporté porte tout, puis l'issue supprimée, il s'exporte encore à l'identique")
    void the_dossier_survives_the_deletion_of_its_issue() throws Exception {
        mission();
        JsonNode before = export();
        assertThat(before.get("mission").get("issue").asText()).isEqualTo("WEB-1");
        assertThat(before.get("mission").get("agent").get("model").asText()).isEqualTo("claude-sonnet-5-20261001");
        assertThat(before.get("rules").get("format").asText()).isEqualTo("taskforce-rules/1");
        assertThat(before.get("texts").get(EvidenceChain.sha256("Fix the footer links")).asText()).isEqualTo("Fix the footer links");
        assertThat(events(before)).extracting(e -> e.get("data").path("kind").asText()).contains("gap");
        assertThat(EvidenceSeal.open(before.get("seal")).valid()).isTrue();

        jdbc.update("DELETE FROM issues WHERE id = ?", issue.getId());
        em.clear();

        assertThat(runRepository.findById(run.getId())).isEmpty();
        assertThat(dossiers.findById(run.getId())).isPresent();
        JsonNode after = export();
        assertThat(CanonicalJson.of(after)).isEqualTo(CanonicalJson.of(before));
        assertThat(EvidenceChain.firstBrokenLink(events(after))).isEqualTo(-1);
        assertThat(after.get("root").asText()).isEqualTo(events(after).getLast().get("hash").asText());
        EvidenceSeal.Opened seal = EvidenceSeal.open(after.get("seal"));
        assertThat(seal.valid()).isTrue();
        assertThat(seal.statement().get("predicate").get("root").asText()).isEqualTo(after.get("root").asText());
    }

    @Test
    @DisplayName("après la suppression de l'issue, un texte s'efface encore : la chaîne tient, un nouveau sceau la couvre")
    void a_text_is_erased_after_the_issue_is_gone() throws Exception {
        mission();
        jdbc.update("DELETE FROM issues WHERE id = ?", issue.getId());
        em.clear();
        String title = EvidenceChain.sha256("Fix the footer links");

        evidence.eraseText(run.getId(), title, userRepository.findById(ada.getId()).orElseThrow());
        em.flush();
        em.clear();

        JsonNode file = export();
        assertThat(file.get("texts").has(title)).isFalse();
        assertThat(EvidenceChain.firstBrokenLink(events(file))).isEqualTo(-1);
        assertThat(events(file).getLast().get("data").get("kind").asText()).isEqualTo("erased");
        assertThat(EvidenceSeal.open(file.get("seal")).statement().get("predicate").get("seq").asInt())
            .isEqualTo(events(file).size());
    }

    @Test
    @DisplayName("la base refuse de modifier un événement du dossier")
    void an_event_cannot_be_changed() {
        mission();

        assertThatThrownBy(() -> jdbc.update("UPDATE delivery_run_evidence SET data = '{}' WHERE run_id = ? AND seq = 2", run.getId()))
            .isInstanceOf(DataAccessException.class).hasMessageContaining("never changes");
    }

    @Test
    @DisplayName("la base refuse d'effacer un événement seul")
    void an_event_cannot_be_deleted_alone() {
        mission();

        assertThatThrownBy(() -> jdbc.update("DELETE FROM delivery_run_evidence WHERE run_id = ? AND seq = 2", run.getId()))
            .isInstanceOf(DataAccessException.class).hasMessageContaining("only deleted with its whole dossier");
    }

    @Test
    @DisplayName("la base refuse de réécrire un sceau")
    void a_seal_cannot_be_rewritten() {
        mission();

        assertThatThrownBy(() -> jdbc.update("UPDATE mission_dossier_seals SET root = 'sha256:x' WHERE run_id = ?", run.getId()))
            .isInstanceOf(DataAccessException.class).hasMessageContaining("never changes");
    }

    @Test
    @DisplayName("la base refuse d'effacer un dossier tant que son espace existe")
    void a_dossier_cannot_be_deleted_while_its_workspace_lives() {
        mission();

        assertThatThrownBy(() -> jdbc.update("DELETE FROM mission_dossiers WHERE run_id = ?", run.getId()))
            .isInstanceOf(DataAccessException.class).hasMessageContaining("only deleted with its workspace");
    }

    @Test
    @DisplayName("la base refuse de changer la ligne du dossier : son issue, son espace")
    void a_dossier_row_cannot_be_changed() {
        mission();

        assertThatThrownBy(() -> jdbc.update("UPDATE mission_dossiers SET issue_key = 'WEB-2' WHERE run_id = ?", run.getId()))
            .isInstanceOf(DataAccessException.class).hasMessageContaining("never changes");
    }

    /** Une écriture que la base refuse, avec ce message ; la transaction du test reste utilisable après. */
    private void refused(String sql, String message, Object... args) {
        jdbc.execute("SAVEPOINT refused");
        try {
            assertThatThrownBy(() -> jdbc.update(sql, args)).as(sql).isInstanceOf(DataAccessException.class)
                .hasMessageContaining(message);
        } finally {
            jdbc.execute("ROLLBACK TO SAVEPOINT refused");
        }
    }

    @Test
    @DisplayName("un texte à côté de la chaîne ne change pas : il ne fait que s'effacer, et ne part qu'avec son dossier")
    void a_text_is_only_erased() {
        mission();
        String title = EvidenceChain.sha256("Fix the footer links");

        refused("UPDATE mission_dossier_texts SET body = 'Fix nothing' WHERE run_id = ? AND hash = ?", "never changes",
            run.getId(), title);
        refused("UPDATE mission_dossier_texts SET kind = 'brief' WHERE run_id = ? AND hash = ?", "never changes",
            run.getId(), title);
        refused("UPDATE mission_dossier_texts SET erased_at = now() WHERE run_id = ? AND hash = ?", "never changes",
            run.getId(), title);
        refused("DELETE FROM mission_dossier_texts WHERE run_id = ? AND hash = ?", "only erased, never deleted",
            run.getId(), title);
        jdbc.update("UPDATE mission_dossier_texts SET body = NULL, erased_at = now(), erased_by = ? WHERE run_id = ? AND hash = ?",
            ada.getId(), run.getId(), title);
        refused("UPDATE mission_dossier_texts SET body = 'Fix the footer links', erased_at = NULL, erased_by = NULL "
            + "WHERE run_id = ? AND hash = ?", "never changes", run.getId(), title);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_texts WHERE run_id = ? AND hash = ? AND body IS NULL",
            Integer.class, run.getId(), title)).isEqualTo(1);
    }

    @Test
    @DisplayName("la base refuse de vider d'un coup les tables du dossier")
    void the_dossier_tables_are_never_emptied() {
        mission();

        for (String table : List.of("delivery_run_evidence", "mission_dossier_seals", "mission_dossier_texts",
            "mission_dossiers CASCADE", "workspaces CASCADE")) {
            refused("TRUNCATE " + table, "never emptied");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM delivery_run_evidence WHERE run_id = ?", Integer.class, run.getId()))
            .isPositive();
    }

    @Test
    @DisplayName("le compte de la personne qui a délégué supprimé : le dossier reste, sans elle")
    void the_delegator_s_account_can_go() {
        mission();

        jdbc.update("UPDATE mission_dossiers SET delegated_by = NULL WHERE run_id = ?", run.getId());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossiers WHERE run_id = ? AND delegated_by IS NULL",
            Integer.class, run.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("le dossier ne part qu'avec son espace de travail, et tout ce qui pend à lui avec")
    void the_dossier_goes_with_its_workspace() {
        mission();
        Long runId = run.getId();

        jdbc.update("DELETE FROM workspaces WHERE id = ?", workspace.getId());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossiers WHERE run_id = ?", Integer.class, runId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM delivery_run_evidence WHERE run_id = ?", Integer.class, runId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_seals WHERE run_id = ?", Integer.class, runId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_texts WHERE run_id = ?", Integer.class, runId)).isZero();
    }
}
