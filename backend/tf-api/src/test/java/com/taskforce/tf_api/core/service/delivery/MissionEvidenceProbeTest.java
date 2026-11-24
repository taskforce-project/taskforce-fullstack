package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceHeader;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvidence;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.MissionDossierSeal;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunEvidenceRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.IssueChecklistItemRepository;
import com.taskforce.tf_api.core.repository.MissionDossierRepository;
import com.taskforce.tf_api.core.repository.MissionDossierSealRepository;
import com.taskforce.tf_api.core.repository.MissionDossierTextRepository;

/**
 * Les sondes de la relecture R159 de #551 sur le dossier, écrites pour tourner aussi sur le code d'avant le correctif
 * (68964f2d), où elles échouent : M2 (l'export Markdown donnait la garde de la clé d'aujourd'hui), M4 (le plafond avalait
 * la fin et les gestes), M7 (un dossier d'avant ce lot ne se vérifiait plus), L6 (un runner perdu ne laissait pas de
 * marque), M5 (rien ne disait d'où viennent les faits du runner).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Le dossier, sondes de la relecture R159 (#551)")
class MissionEvidenceProbeTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock private DeliveryRunEvidenceRepository repository;
    @Mock private DeliveryRunRepository runRepository;
    @Mock private MissionDossierRepository dossiers;
    @Mock private MissionDossierSealRepository sealRepository;
    @Mock private MissionDossierTextRepository textRepository;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private IssueChecklistItemRepository checklist;
    @Mock private ApplicationEventPublisher publisher;
    @Spy private EvidenceSigner signer = new EvidenceSigner("", "", "");
    @InjectMocks private MissionEvidenceService service;

    private final List<DeliveryRunEvidence> stored = new ArrayList<>();
    private final Map<Long, MissionDossier> rows = new HashMap<>();
    private final List<MissionDossierSeal> seals = new ArrayList<>();
    private DeliveryRun run;

    @BeforeEach
    void setUp() {
        User ada = User.builder().id(7L).email("ada@taskforce.dev").build();
        Workspace workspace = Workspace.builder().id(3L).slug("acme").owner(ada).build();
        Project project = Project.builder().id(12L).identifier("WEB").workspace(workspace).build();
        Issue issue = Issue.builder().id(55L).sequenceNumber(12).title("Fix the footer").project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").model("claude-sonnet-5")
            .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada").build();
        run.setCreatedAt(LocalDateTime.of(2026, 11, 22, 8, 0));
        lenient().when(repository.save(any())).thenAnswer(inv -> {
            stored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(repository.findTopByRunIdOrderBySeqDesc(100L))
            .thenAnswer(inv -> stored.isEmpty() ? Optional.empty() : Optional.of(stored.getLast()));
        lenient().when(repository.findByRunIdOrderBySeqAsc(100L)).thenAnswer(inv -> List.copyOf(stored));
        lenient().when(runRepository.findByIdForUpdate(100L)).thenAnswer(inv -> Optional.of(run));
        lenient().when(dossiers.existsById(anyLong())).thenAnswer(inv -> rows.containsKey(inv.<Long>getArgument(0)));
        lenient().when(dossiers.findById(anyLong())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<Long>getArgument(0))));
        lenient().when(dossiers.findByIdForUpdate(anyLong())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<Long>getArgument(0))));
        lenient().when(dossiers.saveAndFlush(any())).thenAnswer(inv -> {
            MissionDossier row = inv.getArgument(0);
            rows.put(row.getRunId(), row);
            return row;
        });
        lenient().when(sealRepository.save(any())).thenAnswer(inv -> {
            seals.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenAnswer(inv -> seals.isEmpty() ? Optional.empty() : Optional.of(seals.getLast()));
        lenient().when(sealRepository.existsByRunIdAndSeq(anyLong(), anyInt()))
            .thenAnswer(inv -> seals.stream().anyMatch(s -> s.getSeq().equals(inv.getArgument(1))));
    }

    /** Un événement tel qu'un dossier d'avant ce lot le garde : chaîné, sans passer par ce que l'entrée corrige aujourd'hui. */
    private void storedAsBefore(String type, ObjectNode data) {
        int seq = stored.size() + 1;
        String prev = stored.isEmpty() ? EvidenceChain.ZERO_HASH : stored.getLast().getHash();
        String at = "2026-11-22T08:00:0" + seq + ".000Z";
        String hash = EvidenceChain.link(prev, EvidenceChain.event(seq, at, type, "server", "taskforce", data)).get("hash").asText();
        stored.add(DeliveryRunEvidence.builder().runId(100L).seq(seq).at(at).type(type).actorKind("server").actorId("taskforce")
            .data(CanonicalJson.of(data)).prev(prev).hash(hash).build());
    }

    @Test
    @DisplayName("M4 : au plafond, la fin, le geste et le témoin s'écrivent encore, dans la réserve")
    void the_cap_keeps_room_for_the_server_and_the_people() {
        ObjectNode full = JSON.createObjectNode().put("max", 10_000).put("text", "The evidence of this mission is full.");
        storedAsBefore("mission.started", JSON.createObjectNode().put("issue", "WEB-12"));
        DeliveryRunEvidence marker = DeliveryRunEvidence.builder().runId(100L).seq(MissionEvidenceService.MAX_EVENTS)
            .at("2026-11-22T09:00:00.000Z").type("limit.reached").actorKind("server").actorId("taskforce")
            .data(CanonicalJson.of(full)).prev(stored.getLast().getHash()).hash("sha256:" + "d".repeat(64)).build();
        stored.add(marker);

        service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, null, null, null));
        service.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", "someone"),
            Map.of("decision", "DISCARD", "reason", "Wrong approach"));

        assertThat(stored).extracting(DeliveryRunEvidence::getType).contains("mission.ended", "human.decision");
        assertThat(stored.getLast().getSeq()).isGreaterThan(MissionEvidenceService.MAX_EVENTS);
    }

    @Test
    @DisplayName("M7 : un dossier d'avant ce lot, avec une demi-paire gardée échappée, se vérifie encore une fois exporté")
    void a_record_with_a_lone_surrogate_still_checks_once_exported() throws Exception {
        rows.put(100L, MissionDossier.builder().runId(100L).workspace(run.getIssue().getProject().getWorkspace()).build());
        storedAsBefore("mission.started", JSON.createObjectNode().put("issue", "WEB-12"));
        // L'ancienne coupe : substring au milieu d'un emoji, gardée telle quelle par le JSON canonique.
        storedAsBefore("note", JSON.createObjectNode().put("kind", "text").put("text", "abc\ud83d"));

        byte[] exported = service.dossierJson(100L).orElseThrow().getBytes(StandardCharsets.UTF_8);
        JsonNode file = JSON.readTree(new String(exported, StandardCharsets.UTF_8));
        List<ObjectNode> events = new ArrayList<>();
        file.get("events").forEach(e -> events.add((ObjectNode) e));

        assertThat(EvidenceChain.firstBrokenLink(events)).isEqualTo(-1);
    }

    @Test
    @DisplayName("L6 : un runner perdu laisse la marque des événements qui peuvent manquer")
    void a_lost_runner_leaves_a_mark() throws Exception {
        service.append(run, "mission.started", MissionEvidenceService.Actor.SERVER, Map.of("issue", "WEB-12"));
        run.setEvidenceRunnerSeq(14);

        service.end(run, new DeliveryPoll(DeliveryRunStatus.FAILED, null, null,
            "Runner lost: no heartbeat for more than 10 min. Restart the runner and delegate the task again."));

        JsonNode gap = null;
        for (DeliveryRunEvidence e : stored) {
            JsonNode data = JSON.readTree(e.getData());
            if ("note".equals(e.getType()) && "gap".equals(data.path("kind").asText())) gap = data;
        }
        assertThat(gap).as("a gap note").isNotNull();
        assertThat(gap.get("from").asInt()).isEqualTo(15);
        assertThat(gap.get("to").isNull()).isTrue();
        assertThat(gap.get("text").asText()).contains("after its event 14");
    }
}
