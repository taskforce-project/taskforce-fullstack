package com.taskforce.tf_api.core.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;
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
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.PersonIds;
import com.taskforce.tf_api.core.service.delivery.DeliveryPoll;
import com.taskforce.tf_api.core.service.delivery.MissionEvidenceService;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * Le dossier au plafond, contre un vrai Postgres (R159, second tour) : la sonde E de la relecture. Une mission dont le
 * dossier atteint 10 000 événements, un texte de plus de l'agent, la fin, l'export : tout ce que `npm run verify --key`
 * vérifie tient, la chaîne, les textes gardés à côté (chacun nommé par la chaîne) et le sceau, par la clé du serveur.
 * L'export est aussi écrit dans target/, pour le passer au vérificateur du runner.
 */
@Import({MissionEvidenceService.class, EvidenceSigner.class, HarnessRulesService.class, PersonIds.class})
@DisplayName("Le dossier au plafond se vérifie encore (intégration Postgres)")
class MissionDossierCapIntegrationTest extends AbstractIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private DeliveryRunRepository runRepository;
    @Autowired private MissionEvidenceService evidence;
    @Autowired private EvidenceSigner signer;
    @Autowired private TestEntityManager em;
    @Autowired private JdbcTemplate jdbc;

    private DeliveryRun run;

    @BeforeEach
    void seed() {
        User ada = userRepository.save(User.builder().keycloakId("kc-ada-cap").email("ada@cap.dev").displayName("Ada").isActive(true).build());
        Workspace workspace = workspaceRepository.save(Workspace.builder().name("IT Cap").slug("ws-cap-it").owner(ada).build());
        Project project = projectRepository.save(Project.builder().workspace(workspace).name("Website").identifier("WEB").createdBy(ada).build());
        IssueStatus backlog = issueStatusRepository.save(IssueStatus.builder().project(project).name("Backlog")
            .category(IssueStatusCategory.BACKLOG).position((short) 0).build());
        Issue issue = issueRepository.saveAndFlush(Issue.builder().project(project).status(backlog).reporter(ada).sequenceNumber(1)
            .title("Fix the footer links").priority(IssuePriority.MEDIUM).build());
        run = runRepository.saveAndFlush(DeliveryRun.builder().issue(issue).providerKey("claude-code").model("sonnet")
            .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada").origin("app").build());
    }

    /** Remplit le dossier jusqu'à ce rang, d'un coup : des actions de l'agent, chaînées comme le serveur les chaîne. */
    private void filledTo(int last) {
        int from = jdbc.queryForObject("SELECT max(seq) FROM delivery_run_evidence WHERE run_id = ?", Integer.class, run.getId()) + 1;
        String prev = jdbc.queryForObject("SELECT hash FROM delivery_run_evidence WHERE run_id = ? AND seq = ?", String.class,
            run.getId(), from - 1);
        List<Object[]> rows = new ArrayList<>();
        for (int seq = from; seq <= last; seq++) {
            ObjectNode data = JSON.createObjectNode().put("kind", "tool").put("tool", "Read").put("text", "src/file-" + seq + ".ts");
            String at = EvidenceChain.AT.format(Instant.now());
            String hash = EvidenceChain.link(prev, EvidenceChain.event(seq, at, "action.requested", "agent", "claude-code", data))
                .get("hash").asText();
            rows.add(new Object[] {run.getId(), seq, at, "action.requested", "agent", "claude-code", CanonicalJson.of(data), prev, hash});
            prev = hash;
        }
        jdbc.batchUpdate("INSERT INTO delivery_run_evidence (run_id, seq, at, type, actor_kind, actor_id, data, prev, hash) "
            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows);
    }

    private static RunnerEventsRequest.Event said(int n, String text) {
        return new RunnerEventsRequest.Event("text", null, text, null, null, n, null, null, null, null, null, null);
    }

    /** Chaque empreinte qu'un événement porte pour un texte gardé à côté : {@code { sha256, chars }}, où qu'il soit. */
    private static void named(JsonNode value, Set<String> into) {
        if (value.isObject()) {
            if (value.path("sha256").isTextual() && value.path("chars").isNumber()) into.add(value.get("sha256").asText());
            value.forEach(child -> named(child, into));
        } else if (value.isArray()) {
            value.forEach(child -> named(child, into));
        }
    }

    @Test
    @DisplayName("N1, sonde E : 10 000 événements, un texte de l'agent, la fin ; l'export tient, aucun texte que la chaîne ne nomme")
    void a_record_at_its_cap_still_checks() throws Exception {
        evidence.open(run, null, "tf-runner-ada", Map.of());
        em.flush();
        filledTo(9_998);

        evidence.runnerEvent(run, said(1, "Still reading the footer."));
        evidence.runnerEvent(run, said(2, "One more thing to say, past the cap."));
        evidence.runnerEvent(run, said(3, "And another."));
        evidence.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "## What I did\nThe footer links.", null, null));
        em.flush();

        String exported = evidence.dossierJson(run.getId()).orElseThrow();
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target", "probe-e-export.json"), exported, StandardCharsets.UTF_8);
        Files.writeString(Path.of("target", "probe-e-key.txt"), signer.key().id(), StandardCharsets.UTF_8);
        JsonNode file = JSON.readTree(exported);
        List<ObjectNode> events = new ArrayList<>();
        file.get("events").forEach(e -> events.add((ObjectNode) e));

        // La chaîne et sa tête.
        assertThat(EvidenceChain.firstBrokenLink(events)).isEqualTo(-1);
        assertThat(file.get("root").asText()).isEqualTo(events.getLast().get("hash").asText());
        // Le plafond, une fois, au rang 10 000 ; la fin après lui, dans la réserve.
        assertThat(events).filteredOn(e -> "limit.reached".equals(e.get("type").asText())).hasSize(1)
            .first().satisfies(e -> assertThat(e.get("seq").asInt()).isEqualTo(10_000));
        assertThat(events.getLast().get("type").asText()).isEqualTo("mission.ended");
        // Chaque texte gardé à côté est nommé par la chaîne : celui d'après le plafond n'a pas été gardé.
        Set<String> referenced = new HashSet<>();
        events.forEach(e -> named(e.get("data"), referenced));
        List<String> kept = new ArrayList<>();
        file.get("texts").fieldNames().forEachRemaining(kept::add);
        assertThat(referenced).containsAll(kept);
        assertThat(file.get("texts").toString()).contains("Still reading the footer.").doesNotContain("past the cap");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mission_dossier_texts WHERE run_id = ? AND body LIKE '%past the cap%'",
            Integer.class, run.getId())).isZero();
        // Le sceau, par la clé du serveur, couvre la tête.
        EvidenceSeal.Opened seal = EvidenceSeal.open(file.get("seal"));
        assertThat(seal.valid()).isTrue();
        assertThat(seal.keyId()).isEqualTo(signer.key().id());
        assertThat(seal.statement().get("predicate").get("root").asText()).isEqualTo(events.getLast().get("hash").asText());
    }
}
