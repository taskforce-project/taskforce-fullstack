package com.taskforce.tf_api.core.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.delivery.MissionEvidenceService;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * Les sondes M6 et M5 de la relecture R159 de #551 contre un vrai Postgres, écrites pour tourner aussi sur le code d'avant
 * le correctif (68964f2d), où elles échouent : le courriel de la personne qui délègue entrait en clair dans la chaîne,
 * à jamais ; l'empreinte d'un titre court confirmait une supposition une fois le texte effacé ; et rien ne disait que les
 * faits du runner viennent du poste de l'agent.
 */
@Import({MissionEvidenceService.class, EvidenceSigner.class, HarnessRulesService.class})
@DisplayName("Le dossier, sondes M5 et M6 de la relecture R159 (intégration Postgres)")
class MissionDossierProbeIntegrationTest extends AbstractIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private DeliveryRunRepository runRepository;
    @Autowired private MissionEvidenceService evidence;
    @Autowired private HarnessRulesService rules;
    @Autowired private TestEntityManager em;

    private Workspace workspace;
    private Issue issue;
    private DeliveryRun run;
    private User ada;

    @BeforeEach
    void seed() {
        ada = userRepository.save(User.builder().keycloakId("kc-ada-probe").email("ada@probe.dev").displayName("Ada Lovelace")
            .isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Probe").slug("ws-probe-it").owner(ada).build());
        Project project = projectRepository.save(Project.builder().workspace(workspace).name("Website").identifier("WEB")
            .createdBy(ada).build());
        IssueStatus backlog = issueStatusRepository.save(IssueStatus.builder().project(project).name("Backlog")
            .category(IssueStatusCategory.BACKLOG).position((short) 0).build());
        issue = issueRepository.saveAndFlush(Issue.builder().project(project).status(backlog).reporter(ada).sequenceNumber(1)
            .title("Fix login for Paul Dupont").priority(IssuePriority.MEDIUM).build());
        run = runRepository.saveAndFlush(DeliveryRun.builder().issue(issue).providerKey("claude-code").model("sonnet")
            .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-probe").origin("app").build());
        RulesBundle bundle = rules.bundleFor(workspace, new HarnessRulesService.Work(project.getId(), null, ada.getId()));
        evidence.open(run, bundle, "tf-runner-probe", Map.of());
        em.flush();
        em.clear();
    }

    private JsonNode export() throws Exception {
        return JSON.readTree(evidence.dossierJson(run.getId()).orElseThrow());
    }

    @Test
    @DisplayName("M6 : la personne entre dans la chaîne par un identifiant opaque ; son courriel, seulement à côté")
    void people_enter_the_chain_by_an_opaque_id() throws Exception {
        JsonNode file = export();
        JsonNode started = file.get("events").get(0).get("data");

        assertThat(started.get("requestedBy").asText()).startsWith("person:");
        assertThat(file.get("mission").get("requestedBy").asText()).startsWith("person:");
        assertThat(file.get("events").toString()).doesNotContain("ada@probe.dev").doesNotContain("Ada Lovelace");
    }

    @Test
    @DisplayName("M6 : l'empreinte d'un titre est salée : seule, elle ne confirme pas une supposition")
    void a_title_digest_is_salted() throws Exception {
        JsonNode title = export().get("events").get(0).get("data").get("request").get("title");

        assertThat(title.get("sha256").asText()).isNotEqualTo(EvidenceChain.sha256("Fix login for Paul Dupont"));
    }

    @Test
    @DisplayName("M5 : la chaîne et l'en-tête disent que les faits du runner viennent du poste de l'agent")
    void the_runner_s_facts_come_from_the_agent_s_machine() throws Exception {
        JsonNode file = export();

        assertThat(file.get("events").get(0).get("data").path("runnerFacts").asText()).isEqualTo("agent-machine");
        assertThat(file.get("mission").path("runnerFacts").asText()).isEqualTo("agent-machine");
    }
}
