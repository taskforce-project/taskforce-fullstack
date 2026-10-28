package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvidence;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunEvidenceRepository;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;

/**
 * Dossier de preuve d'une mission (spécification de la v2, §9) : chaîné à l'ajout, vérifiable par recalcul à l'export,
 * jamais tronqué en silence, scellé à la fin.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Dossier de preuve d'une mission")
class MissionEvidenceServiceTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock private DeliveryRunEvidenceRepository repository;
    @Mock private DeliveryRunRepository runRepository;

    /** Ce que la base garde, dans l'ordre. */
    private final List<DeliveryRunEvidence> stored = new ArrayList<>();
    private MissionEvidenceService service;
    private DeliveryRun run;

    @BeforeEach
    void setUp() {
        service = new MissionEvidenceService(repository, runRepository);
        Workspace workspace = Workspace.builder().slug("acme").build();
        Project project = Project.builder().id(12L).identifier("WEB").workspace(workspace).build();
        Issue issue = Issue.builder().id(55L).sequenceNumber(12).title("Fix the footer").project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").model("claude-sonnet-5")
            .status(DeliveryRunStatus.RUNNING).startedBy(User.builder().id(7L).email("ada@taskforce.dev").build())
            .claimedBy("tf-runner-ada").rulesVersion(1).rulesDigest("sha256:" + "a".repeat(64)).build();
        lenient().when(repository.save(any())).thenAnswer(inv -> {
            stored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(repository.findTopByRunIdOrderBySeqDesc(100L))
            .thenAnswer(inv -> stored.isEmpty() ? Optional.empty() : Optional.of(stored.getLast()));
        lenient().when(repository.findByRunIdOrderBySeqAsc(100L)).thenAnswer(inv -> List.copyOf(stored));
    }

    private void startAndAct() {
        service.append(run, "mission.started", MissionEvidenceService.Actor.SERVER, Map.of("issue", "WEB-12"));
        service.append(run, "action.decided", new MissionEvidenceService.Actor("rule", "read-files"),
            Map.of("tool", "Read", "effect", "allow", "text", "src/app.ts"));
    }

    @Test
    @DisplayName("chaque événement porte l'empreinte du précédent, la chaîne part de l'empreinte nulle")
    void events_are_chained() {
        startAndAct();

        assertThat(stored).extracting(DeliveryRunEvidence::getSeq).containsExactly(1, 2);
        assertThat(stored.get(0).getPrev()).isEqualTo(EvidenceChain.ZERO_HASH);
        assertThat(stored.get(1).getPrev()).isEqualTo(stored.get(0).getHash());
        assertThat(stored.get(1).getData()).isEqualTo("{\"effect\":\"allow\",\"text\":\"src/app.ts\",\"tool\":\"Read\"}");
    }

    @Test
    @DisplayName("l'export se vérifie par recalcul, et une donnée changée en base se voit, au bon endroit")
    void the_export_checks_and_a_change_shows() {
        startAndAct();
        assertThat(EvidenceChain.firstBrokenLink(service.events(100L))).isEqualTo(-1);

        DeliveryRunEvidence second = stored.get(1);
        stored.set(1, DeliveryRunEvidence.builder().run(run).seq(2).at(second.getAt()).type(second.getType())
            .actorKind(second.getActorKind()).actorId(second.getActorId())
            .data(second.getData().replace("allow", "deny")).prev(second.getPrev()).hash(second.getHash()).build());

        assertThat(EvidenceChain.firstBrokenLink(service.events(100L))).isEqualTo(1);
        assertThat(service.dossierMarkdown(run).orElseThrow()).contains("BROKEN at event 2");
    }

    @Test
    @DisplayName("le fichier suit taskforce-evidence/1 : la mission, les événements, la racine")
    void the_file_follows_the_contract() throws Exception {
        startAndAct();

        JsonNode file = JSON.readTree(service.dossierJson(run).orElseThrow());

        assertThat(file.get("format").asText()).isEqualTo("taskforce-evidence/1");
        assertThat(file.get("mission").get("issue").asText()).isEqualTo("WEB-12");
        assertThat(file.get("mission").get("requestedBy").asText()).isEqualTo("ada@taskforce.dev");
        assertThat(file.get("mission").get("rules").get("version").asInt()).isEqualTo(1);
        assertThat(file.get("events")).hasSize(2);
        assertThat(file.get("root").asText()).isEqualTo(stored.getLast().getHash());
        List<ObjectNode> events = new ArrayList<>();
        file.get("events").forEach(e -> events.add((ObjectNode) e));
        assertThat(EvidenceChain.firstBrokenLink(events)).isEqualTo(-1);
    }

    @Test
    @DisplayName("un run sans dossier (v1, autre fournisseur) n'a ni export ni clôture")
    void no_evidence_no_file() {
        service.end(run, new DeliveryPoll(DeliveryRunStatus.DONE, "done", null, null));

        assertThat(stored).isEmpty();
        assertThat(run.getEvidenceRoot()).isNull();
        assertThat(service.dossierJson(run)).isEmpty();
        assertThat(service.dossierMarkdown(run)).isEmpty();
    }

    @Test
    @DisplayName("la fin de mission clôt le dossier et pose sa racine sur le run")
    void the_end_seals_the_file() {
        startAndAct();

        service.end(run, new DeliveryPoll(DeliveryRunStatus.FAILED, null, null, "Runner lost"));

        assertThat(stored.getLast().getType()).isEqualTo("mission.ended");
        assertThat(stored.getLast().getData()).contains("\"error\":\"Runner lost\"").contains("\"status\":\"FAILED\"");
        assertThat(run.getEvidenceRoot()).isEqualTo(stored.getLast().getHash());
        assertThat(service.dossierMarkdown(run).orElseThrow()).contains("every hash holds").contains("| 3 |")
            .contains("- Durations: mission ");
    }

    @Test
    @DisplayName("le temps de cycle se lit dans la chaîne : la mission, et l'attente d'une personne demande par demande")
    void cycle_time_comes_from_the_chain() {
        List<ObjectNode> events = List.of(
            event("2026-10-28T10:00:00.000Z", "mission.started", Map.of()),
            event("2026-10-28T10:01:00.000Z", "action.decided", Map.of("approval", 9, "effect", "ask")),
            event("2026-10-28T10:03:30.000Z", "human.decision", Map.of("approval", 9, "decision", "ALLOWED")),
            event("2026-10-28T10:04:00.000Z", "action.decided", Map.of("approval", 10, "effect", "ask")),
            event("2026-10-28T10:14:00.000Z", "action.decided", Map.of("approval", 10, "effect", "deny")),
            event("2026-10-28T10:20:05.000Z", "mission.ended", Map.of("status", "DONE")));

        assertThat(MissionEvidenceService.durations(events))
            .isEqualTo("mission 20 min 5 s; waiting for a person 12 min 30 s (2 requests)");
    }

    private static ObjectNode event(String at, String type, Map<String, ?> data) {
        ObjectNode e = JSON.createObjectNode();
        e.put("at", at);
        e.put("type", type);
        e.set("data", JSON.valueToTree(data));
        return e;
    }

    @Test
    @DisplayName("plein, le dossier le dit par un dernier événement, puis ne garde plus rien")
    void a_full_file_says_so() {
        stored.add(DeliveryRunEvidence.builder().run(run).seq(MissionEvidenceService.MAX_EVENTS - 1).at("2026-10-28T10:00:00.000Z")
            .type("note").actorKind("agent").actorId("claude-code").data("{}").prev(EvidenceChain.ZERO_HASH)
            .hash("sha256:" + "b".repeat(64)).build());

        Optional<String> limit = service.append(run, "note", new MissionEvidenceService.Actor("agent", "claude-code"), Map.of("text", "x"));
        Optional<String> after = service.append(run, "note", new MissionEvidenceService.Actor("agent", "claude-code"), Map.of("text", "y"));

        assertThat(limit).isPresent();
        assertThat(stored.getLast().getType()).isEqualTo(MissionEvidenceService.LIMIT_REACHED);
        assertThat(stored.getLast().getActorKind()).isEqualTo("server");
        assertThat(after).isEmpty();
        assertThat(stored).hasSize(2);
    }
}
