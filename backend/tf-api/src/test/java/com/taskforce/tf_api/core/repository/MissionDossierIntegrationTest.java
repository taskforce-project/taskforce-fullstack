package com.taskforce.tf_api.core.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
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
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.delivery.DeliveryPoll;
import com.taskforce.tf_api.core.service.delivery.MissionEvidenceService;
import com.taskforce.tf_api.core.service.delivery.MissionLateSeals;
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
    @Autowired private MissionDossierSealRepository seals;
    @Autowired private DeliveryRunEvidenceRepository evidenceRepository;
    @Autowired private EvidenceSigner signer;

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
        evidence.appendAfterEnd(run, "human.decision", evidence.person(run, ada), Map.of("decision", "MARK_DONE", "where", "taskforce"));
        em.flush();
        em.clear();
    }

    private JsonNode export() throws Exception {
        return JSON.readTree(evidence.dossierJson(run.getId()).orElseThrow());
    }

    /** L'empreinte salée du titre, telle que la chaîne la porte (R159, M6). */
    private String title() {
        return jdbc.queryForObject("SELECT hash FROM mission_dossier_texts WHERE run_id = ? AND kind = 'title'", String.class, run.getId());
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
        JsonNode title = before.get("texts").get(title());
        assertThat(title.get("text").asText()).isEqualTo("Fix the footer links");
        assertThat(EvidenceChain.sha256(title.get("salt").asText() + "Fix the footer links")).isEqualTo(title());
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
        String title = title();

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
    @DisplayName("un texte à côté de la chaîne ne change pas : il ne fait que s'effacer, avec son sel, et ne part qu'avec son dossier")
    void a_text_is_only_erased() {
        mission();
        String title = title();

        refused("UPDATE mission_dossier_texts SET body = 'Fix nothing' WHERE run_id = ? AND hash = ?", "never changes",
            run.getId(), title);
        refused("UPDATE mission_dossier_texts SET kind = 'brief' WHERE run_id = ? AND hash = ?", "never changes",
            run.getId(), title);
        refused("UPDATE mission_dossier_texts SET erased_at = now() WHERE run_id = ? AND hash = ?", "never changes",
            run.getId(), title);
        // R159, M6 : le sel ne change pas tant que le texte est là, ni la personne qu'un texte décrit.
        refused("UPDATE mission_dossier_texts SET salt = '0123456789abcdef0123456789abcdef' WHERE run_id = ? AND hash = ?",
            "never changes", run.getId(), title);
        refused("UPDATE mission_dossier_texts SET salt = NULL WHERE run_id = ? AND hash = ?", "never changes", run.getId(), title);
        refused("UPDATE mission_dossier_texts SET person = 'who:" + "0".repeat(32) + "' WHERE run_id = ? AND kind = 'email'",
            "never changes", run.getId());
        refused("DELETE FROM mission_dossier_texts WHERE run_id = ? AND hash = ?", "only erased, never deleted",
            run.getId(), title);
        jdbc.update("UPDATE mission_dossier_texts SET body = NULL, salt = NULL, erased_at = now(), erased_by = ? "
            + "WHERE run_id = ? AND hash = ?", ada.getId(), run.getId(), title);
        refused("UPDATE mission_dossier_texts SET body = 'Fix the footer links', erased_at = NULL, erased_by = NULL "
            + "WHERE run_id = ? AND hash = ?", "never changes", run.getId(), title);
        refused("UPDATE mission_dossier_texts SET salt = '0123456789abcdef0123456789abcdef' WHERE run_id = ? AND hash = ?",
            "never changes", run.getId(), title);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_texts WHERE run_id = ? AND hash = ? AND body IS NULL "
            + "AND salt IS NULL", Integer.class, run.getId(), title)).isEqualTo(1);
    }

    @Test
    @DisplayName("R159, M6 : chaque personne entre par un identifiant opaque, le même d'une mission à l'autre ; son courriel, à côté")
    void people_enter_by_an_opaque_and_stable_id() throws Exception {
        mission();

        JsonNode file = export();
        String id = jdbc.queryForObject("SELECT person FROM mission_people WHERE user_id = ?", String.class, ada.getId());
        assertThat(id).matches("who:[0-9a-f]{32}");
        assertThat(file.get("mission").get("requestedBy").asText()).isEqualTo(id);
        assertThat(file.get("events").toString()).doesNotContain("ada@it.dev");
        assertThat(events(file)).filteredOn(e -> "person".equals(e.get("data").path("kind").asText())).hasSize(1);
        assertThat(events(file).getLast().get("actor").get("id").asText()).isEqualTo(id);
        assertThat(file.get("texts").toString()).contains("ada@it.dev");
        // Une autre mission de la même personne la nomme du même identifiant.
        DeliveryRun other = runRepository.saveAndFlush(DeliveryRun.builder().issue(issueRepository.findById(issue.getId()).orElseThrow())
            .providerKey("claude-code").model("sonnet").status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada")
            .origin("app").build());
        evidence.open(other, null, "tf-runner-ada", Map.of());
        em.flush();
        assertThat(JSON.readTree(evidence.dossierJson(other.getId()).orElseThrow()).get("mission").get("requestedBy").asText())
            .isEqualTo(id);
    }

    @Test
    @DisplayName("R159 second tour, L-a et L-e : un identifiant par espace, que rien ne relie d'un espace à l'autre, et un préfixe à lui")
    void a_person_has_one_id_per_workspace() throws Exception {
        mission();
        Workspace second = workspaceRepository.save(Workspace.builder().name("IT Dossier 2").slug("ws-dossier-it-2").owner(ada).build());
        Project project = projectRepository.save(Project.builder().workspace(second).name("Docs").identifier("DOC").createdBy(ada).build());
        IssueStatus backlog = issueStatusRepository.save(IssueStatus.builder().project(project).name("Backlog")
            .category(IssueStatusCategory.BACKLOG).position((short) 0).build());
        Issue other = issueRepository.saveAndFlush(Issue.builder().project(project).status(backlog).reporter(ada).sequenceNumber(1)
            .title("Write the guide").priority(IssuePriority.MEDIUM).build());
        DeliveryRun elsewhere = runRepository.saveAndFlush(DeliveryRun.builder().issue(other).providerKey("claude-code").model("sonnet")
            .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada").origin("app").build());

        evidence.open(elsewhere, null, "tf-runner-ada", Map.of());
        em.flush();

        String here = export().get("mission").get("requestedBy").asText();
        String there = JSON.readTree(evidence.dossierJson(elsewhere.getId()).orElseThrow()).get("mission").get("requestedBy").asText();
        assertThat(here).matches("who:[0-9a-f]{32}");
        assertThat(there).matches("who:[0-9a-f]{32}").isNotEqualTo(here);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_people WHERE user_id = ?", Integer.class, ada.getId())).isEqualTo(2);
        // Le compte purgé : ses deux identifiants partent, et ses textes s'effacent dans les deux espaces.
        assertThat(evidence.forgetPerson(ada.getId())).isEqualTo(2);
        em.flush();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_people WHERE user_id = ?", Integer.class, ada.getId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_texts WHERE person IN (?, ?) AND body IS NOT NULL",
            Integer.class, here, there)).isZero();
    }

    @Test
    @DisplayName("R159, M6 : le compte purgé, son courriel et son nom s'effacent de chaque dossier ; la chaîne tient, un sceau neuf la couvre")
    void a_purged_account_is_forgotten() throws Exception {
        mission();
        String id = jdbc.queryForObject("SELECT person FROM mission_people WHERE user_id = ?", String.class, ada.getId());

        assertThat(evidence.forgetPerson(ada.getId())).isEqualTo(1);
        em.flush();
        em.clear();

        JsonNode file = export();
        // La chaîne, l'en-tête, les textes, et la copie du paquet de règles, qui nomme qui répond de chaque règle par son
        // identifiant (R159, second tour, N3) : le courriel n'est plus nulle part.
        String record = file.get("events").toString() + file.get("mission") + file.get("texts") + file.get("rules");
        assertThat(record).doesNotContain("ada@it.dev").doesNotContain("\"Ada\"");
        assertThat(EvidenceChain.firstBrokenLink(events(file))).isEqualTo(-1);
        JsonNode erased = events(file).getLast().get("data");
        assertThat(erased.get("kind").asText()).isEqualTo("erased");
        assertThat(erased.get("person").asText()).isEqualTo(id);
        assertThat(erased.get("reason").asText()).isEqualTo("account-deleted");
        EvidenceSeal.Opened seal = EvidenceSeal.open(file.get("seal"));
        assertThat(seal.valid()).isTrue();
        assertThat(seal.statement().get("predicate").get("seq").asInt()).isEqualTo(events(file).size());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_people WHERE user_id = ?", Integer.class, ada.getId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_texts WHERE person = ? AND (body IS NOT NULL OR salt IS NOT NULL)",
            Integer.class, id)).isZero();
    }

    /** Un dossier d'avant la 1.18 : sa ligne, et une chaîne qui nomme la personne par son courriel, sans sceau. */
    private void legacyRecord() {
        dossiers.saveAndFlush(MissionDossier.builder().runId(run.getId()).workspace(workspace).projectId(issue.getProject().getId())
            .issueId(issue.getId()).issueKey("WEB-1").delegatedBy(ada).createdAt(LocalDateTime.now()).build());
        String prev = EvidenceChain.ZERO_HASH;
        List<Object[]> rows = new ArrayList<>();
        Object[][] events = {
            {"mission.started", "server", "taskforce", JSON.createObjectNode().put("issue", "WEB-1").put("requestedBy", "ada@it.dev")},
            {"action.decided", "server", "taskforce", JSON.createObjectNode().put("approval", 3).put("effect", "ask").put("asked", "ada@it.dev")},
            {"human.decision", "person", "ada@it.dev", JSON.createObjectNode().put("approval", 3).put("decision", "ALLOWED")},
            {"mission.ended", "server", "taskforce", JSON.createObjectNode().put("status", "DONE")},
        };
        for (int i = 0; i < events.length; i++) {
            Object[] e = events[i];
            String at = "2026-10-01T10:00:0" + i + ".000Z";
            String hash = EvidenceChain.link(prev, EvidenceChain.event(i + 1, at, (String) e[0], (String) e[1], (String) e[2], (ObjectNode) e[3]))
                .get("hash").asText();
            rows.add(new Object[] {run.getId(), i + 1, at, e[0], e[1], e[2], CanonicalJson.of((ObjectNode) e[3]), prev, hash});
            prev = hash;
        }
        jdbc.batchUpdate("INSERT INTO delivery_run_evidence (run_id, seq, at, type, actor_kind, actor_id, data, prev, hash) "
            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows);
        jdbc.update("UPDATE delivery_runs SET status = 'DONE', evidence_root = ? WHERE id = ?", prev, run.getId());
        em.clear();
    }

    @Test
    @DisplayName("R159 second tour, N4 : à la purge, un dossier d'avant la 1.18 le dit sans nommer personne, et se scelle tard")
    void a_purge_marks_the_chains_from_before_1_18() throws Exception {
        legacyRecord();
        assertThat(evidence.legacy(run.getId())).isTrue();

        assertThat(evidence.forgetPerson(ada.getId())).isEqualTo(1);
        em.flush();

        JsonNode file = export();
        assertThat(EvidenceChain.firstBrokenLink(events(file))).isEqualTo(-1);
        JsonNode note = events(file).getLast().get("data");
        assertThat(note.get("kind").asText()).isEqualTo("erased");
        assertThat(note.get("legacy").asBoolean()).isTrue();
        assertThat(note.get("events")).extracting(JsonNode::asInt).containsExactly(1, 2, 3);
        assertThat(note.get("reason").asText()).isEqualTo("account-deleted");
        assertThat(note.toString()).doesNotContain("ada@it.dev").doesNotContain("who:");
        EvidenceSeal.Opened seal = EvidenceSeal.open(file.get("seal"));
        assertThat(seal.valid()).isTrue();
        assertThat(seal.statement().get("predicate").get("late").asBoolean()).isTrue();
        // L'export lisible masque chaque courriel de la chaîne.
        assertThat(evidence.dossierMarkdown(run.getId()).orElseThrow()).doesNotContain("ada@it.dev").contains("(email hidden)");
    }

    @Test
    @DisplayName("R159 second tour, N4 : un dossier d'après la 1.18 n'est pas d'avant, et la purge n'y ajoute pas de note ancienne")
    void a_record_from_1_18_is_not_legacy() throws Exception {
        mission();

        assertThat(evidence.legacy(run.getId())).isFalse();
        evidence.forgetPerson(ada.getId());
        em.flush();

        assertThat(events(export())).noneMatch(e -> e.get("data").path("legacy").asBoolean(false));
    }

    @Test
    @DisplayName("R159 second tour, N5 : un dossier fini sans sceau se scelle une fois, tard, et le dit ; ses sceaux suivants aussi")
    void a_record_from_before_the_seal_is_sealed_late_once() throws Exception {
        // Un dossier d'avant ce lot : sa chaîne, aucun sceau, sa mission finie, sa racine posée sur la mission.
        evidence.open(run, null, "tf-runner-ada", Map.of());
        em.flush();
        String head = jdbc.queryForObject("SELECT hash FROM delivery_run_evidence WHERE run_id = ? ORDER BY seq DESC LIMIT 1",
            String.class, run.getId());
        jdbc.update("UPDATE delivery_runs SET status = 'DONE', evidence_root = ? WHERE id = ?", head, run.getId());
        em.clear();
        MissionLateSeals pass = new MissionLateSeals(dossiers, evidence);

        assertThat(pass.seal()).isEqualTo(1);
        em.flush();
        assertThat(pass.seal()).isZero();

        JsonNode file = export();
        EvidenceSeal.Opened seal = EvidenceSeal.open(file.get("seal"));
        assertThat(seal.valid()).isTrue();
        assertThat(seal.statement().get("predicate").get("late").asBoolean()).isTrue();
        assertThat(seal.statement().get("predicate").get("seq").asInt()).isEqualTo(events(file).size());
        JsonNode note = events(file).getLast().get("data");
        assertThat(note.get("kind").asText()).isEqualTo("late-seal");
        assertThat(note.get("text").asText()).startsWith("TaskForce sealed this record late, on ");
        assertThat(EvidenceChain.firstBrokenLink(events(file))).isEqualTo(-1);
        // Un geste qui suit : son sceau est tardif lui aussi ; un sceau ne le cache pas.
        DeliveryRun ended = runRepository.findById(run.getId()).orElseThrow();
        evidence.appendAfterEnd(ended, "human.decision", evidence.person(ended, ada), Map.of("decision", "MARK_DONE", "where", "taskforce"));
        em.flush();
        EvidenceSeal.Opened after = EvidenceSeal.open(export().get("seal"));
        assertThat(after.statement().get("predicate").get("late").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_seals WHERE run_id = ? AND late", Integer.class, run.getId()))
            .isEqualTo(2);
    }

    @Test
    @DisplayName("R159, M3 : les clés qui ont scellé les dossiers de l'espace se lisent dans les sceaux, sans table de plus")
    void the_keys_used_come_from_the_seals() {
        mission();

        List<MissionDossierSealRepository.KeyUse> used = seals.keysUsedIn(workspace.getId());

        assertThat(used).hasSize(1);
        assertThat(used.getFirst().getKeyId()).isEqualTo(signer.key().id());
        // La fin, puis le geste qui la suit : deux sceaux.
        assertThat(used.getFirst().getSeals()).isEqualTo(2L);
        assertThat(used.getFirst().getFirstUsed()).isLessThanOrEqualTo(used.getFirst().getLastUsed());
        assertThat(seals.lastEnvelopeOf(workspace.getId(), signer.key().id())).get().asString().contains("in-toto");
        assertThat(seals.keysUsedIn(workspace.getId() + 1000)).isEmpty();
    }

    @Test
    @DisplayName("R159, L7 : une mission scellée sans témoin se retrouve, jusqu'à ce que son témoin, ou la raison de son absence, s'écrive")
    void an_unwitnessed_mission_is_found_until_its_witness_is_written() {
        mission();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("UPDATE delivery_runs SET ended_at = ? WHERE id = ?", now.minusHours(1), run.getId());

        assertThat(evidenceRepository.findUnwitnessed(now.minusDays(7), now.minusMinutes(5))).contains(run.getId());
        assertThat(evidenceRepository.findUnwitnessed(now.minusDays(7), now.minusHours(2))).doesNotContain(run.getId());

        evidence.appendToDossier(run.getId(), "note", MissionEvidenceService.Actor.SERVER,
            Map.of("kind", "witness", "written", false, "reason", "GitHub can't be reached."));
        em.flush();

        assertThat(evidenceRepository.findUnwitnessed(now.minusDays(7), now.minusMinutes(5))).doesNotContain(run.getId());
    }

    @Test
    @DisplayName("R159 second tour, N2 (sonde C) : le témoin a fini, sa note écrite ou non : le passage régulier ne le relance plus")
    void a_witness_that_is_done_is_not_tried_again() {
        mission();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("UPDATE delivery_runs SET ended_at = ? WHERE id = ?", now.minusHours(1), run.getId());
        assertThat(evidenceRepository.findUnwitnessed(now.minusDays(7), now.minusMinutes(5))).contains(run.getId());

        // La note du témoin ne s'est pas écrite ; il a fini quand même.
        evidence.witnessed(run.getId());
        em.flush();

        assertThat(evidenceRepository.findUnwitnessed(now.minusDays(7), now.minusMinutes(5))).doesNotContain(run.getId());
        // Posé une fois : la base refuse de le changer ensuite.
        refused("UPDATE mission_dossiers SET witnessed_at = now() - interval '1 day' WHERE run_id = ?", "never changes", run.getId());
    }

    @Test
    @DisplayName("R159 second tour, M-b : le lien du témoin est un identifiant opaque du dossier, tiré une fois, qui mène à lui seul")
    void the_witness_link_is_an_opaque_id_drawn_once() {
        mission();

        String link = evidence.linkId(run.getId());
        em.flush();

        assertThat(link).matches("[0-9a-f]{32}");
        assertThat(evidence.linkId(run.getId())).isEqualTo(link);
        assertThat(dossiers.findByLinkId(link)).get().extracting(d -> d.getRunId()).isEqualTo(run.getId());
        refused("UPDATE mission_dossiers SET link_id = '" + "0".repeat(32) + "' WHERE run_id = ?", "never changes", run.getId());
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
