package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.RunnerEventsRequest;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.DeliveryRunEvidence;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.MissionDossierSeal;
import com.taskforce.tf_api.core.model.MissionDossierText;
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
import com.taskforce.tf_api.core.repository.MissionPersonRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

/**
 * La sonde D de la relecture R159 de #551, second tour (N2) : l'agent remplissait la réserve. Au plafond, il alternait une
 * commande trop longue (son lot refusé, un trou que le serveur marque) et une commande ordinaire ; les notes de trou, écrites
 * par le serveur, entraient dans la réserve, et au bout de mille paires la fin de la mission, le geste de la personne et le
 * témoin n'étaient plus gardés. Le plafond compte désormais tout ce que la mission fait naître, et la mission s'y arrête.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Le dossier au plafond, sonde D de la relecture R159 (#551, second tour)")
class MissionEvidenceCapProbeTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock private DeliveryRunEvidenceRepository repository;
    @Mock private DeliveryRunRepository runRepository;
    @Mock private MissionDossierRepository dossiers;
    @Mock private MissionDossierSealRepository sealRepository;
    @Mock private MissionDossierTextRepository textRepository;
    @Mock private HarnessRuleSetRepository ruleSets;
    @Mock private IssueChecklistItemRepository checklist;
    @Mock private MissionPersonRepository people;
    @Mock private ApplicationEventPublisher publisher;

    private final List<DeliveryRunEvidence> stored = new ArrayList<>();
    private final List<MissionDossierText> texts = new ArrayList<>();
    private final List<MissionDossierSeal> seals = new ArrayList<>();
    private final Map<Long, MissionDossier> rows = new HashMap<>();
    private MissionEvidenceService service;
    private DeliveryRun run;

    @BeforeEach
    void setUp() {
        service = new MissionEvidenceService(repository, runRepository, dossiers, sealRepository, textRepository, ruleSets,
            checklist, people, new EvidenceSigner("", "", ""), publisher, mock(UserRepository.class));
        User ada = User.builder().id(7L).email("ada@taskforce.dev").build();
        Workspace workspace = Workspace.builder().id(3L).slug("acme").owner(ada).build();
        Project project = Project.builder().id(12L).identifier("WEB").workspace(workspace).build();
        Issue issue = Issue.builder().id(55L).sequenceNumber(12).title("Fix the footer").project(project).build();
        run = DeliveryRun.builder().id(100L).issue(issue).providerKey("claude-code").model("claude-sonnet-5")
            .status(DeliveryRunStatus.RUNNING).startedBy(ada).claimedBy("tf-runner-ada").build();
        run.setCreatedAt(LocalDateTime.of(2026, 11, 22, 8, 0));
        rows.put(100L, MissionDossier.builder().runId(100L).workspace(workspace).build());
        lenient().when(repository.save(any())).thenAnswer(inv -> {
            stored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(repository.findTopByRunIdOrderBySeqDesc(100L))
            .thenAnswer(inv -> stored.isEmpty() ? Optional.empty() : Optional.of(stored.getLast()));
        lenient().when(repository.findByRunIdOrderBySeqAsc(100L)).thenAnswer(inv -> List.copyOf(stored));
        lenient().when(repository.existsByRunIdAndTypeAndActorKind(anyLong(), anyString(), anyString()))
            .thenAnswer(inv -> stored.stream().anyMatch(e -> e.getType().equals(inv.getArgument(1)) && e.getActorKind().equals(inv.getArgument(2))));
        lenient().when(runRepository.findByIdForUpdate(100L)).thenAnswer(inv -> Optional.of(run));
        lenient().when(runRepository.findById(100L)).thenAnswer(inv -> Optional.of(run));
        lenient().when(dossiers.existsById(anyLong())).thenAnswer(inv -> rows.containsKey(inv.<Long>getArgument(0)));
        lenient().when(dossiers.findById(anyLong())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<Long>getArgument(0))));
        lenient().when(textRepository.save(any())).thenAnswer(inv -> {
            texts.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(sealRepository.save(any())).thenAnswer(inv -> {
            seals.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(sealRepository.existsByRunIdAndSeq(anyLong(), anyInt())).thenReturn(false);
        lenient().when(sealRepository.findTopByRunIdOrderBySeqDesc(100L))
            .thenAnswer(inv -> seals.isEmpty() ? Optional.empty() : Optional.of(seals.getLast()));
        // Le dossier, plein jusqu'au rang d'avant le plafond.
        stored.add(DeliveryRunEvidence.builder().runId(100L).seq(MissionEvidenceService.MAX_EVENTS - 1).at("2026-11-22T09:00:00.000Z")
            .type("action.requested").actorKind("agent").actorId("claude-code").data("{}").prev(EvidenceChain.ZERO_HASH)
            .hash("sha256:" + "b".repeat(64)).build());
    }

    private static RunnerEventsRequest.Event tool(int n) {
        return new RunnerEventsRequest.Event("tool", "Bash", "ls", null, null, n, null, null, null, null, null, null);
    }

    private List<DeliveryRunEvidence> after() {
        return stored.stream().filter(e -> e.getSeq() >= MissionEvidenceService.MAX_EVENTS).toList();
    }

    private static String kind(DeliveryRunEvidence e) throws Exception {
        JsonNode data = JSON.readTree(e.getData());
        return e.getType() + "/" + data.path("kind").asText(data.path("decision").asText(""));
    }

    @Test
    @DisplayName("N2, sonde D : les trous comptent au plafond, la mission s'arrête, et la fin, le geste et le témoin s'écrivent encore")
    void gaps_count_against_the_cap_and_the_end_is_kept() throws Exception {
        // Mille paires : un lot refusé (un trou que le serveur marque), puis une commande ordinaire.
        for (int pair = 0; pair < 1_000; pair++) {
            service.runnerEvent(run, tool(2 * pair + 2));
        }
        // Une demande d'accord, puis son expiration : le serveur les écrit à cause de ce que fait l'agent.
        Map<String, Object> asked = new LinkedHashMap<>(Map.of("approval", 9, "tool", "Bash", "effect", "ask"));
        service.append(run, "action.decided", MissionEvidenceService.Actor.SERVER, asked);
        service.end(run, new DeliveryPoll(DeliveryRunStatus.FAILED, null, null, MissionEvidenceCap.STOPPED));
        service.appendToDossier(100L, "note", MissionEvidenceService.Actor.SERVER,
            Map.of("kind", "witness", "written", false, "reason", "This mission has no pull request."));
        service.appendAfterEnd(run, "human.decision", new MissionEvidenceService.Actor("person", "who:" + "1".repeat(32)),
            Map.of("decision", "DISCARD", "where", "taskforce"));

        List<String> kept = new ArrayList<>();
        for (DeliveryRunEvidence e : after()) kept.add(kind(e) + "/" + e.getActorKind());
        assertThat(kept).containsExactly("limit.reached//server", "mission.ended//server", "note/witness/server",
            "human.decision/DISCARD/person");
        assertThat(JSON.readTree(after().getFirst().getData()).get("stopped").asBoolean()).isTrue();
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(publisher, org.mockito.Mockito.atLeastOnce()).publishEvent(published.capture());
        assertThat(published.getAllValues()).filteredOn(EvidenceCapped.class::isInstance).containsExactly(new EvidenceCapped(100L));
    }

    @Test
    @DisplayName("N2 : ce que le runner ou l'agent nomme fin, témoin ou geste ne passe jamais pour la réserve")
    void nothing_from_the_agent_s_computer_enters_the_reserve() {
        MissionEvidenceService.Actor agent = new MissionEvidenceService.Actor("agent", "claude-code");
        MissionEvidenceService.Actor runner = new MissionEvidenceService.Actor("runner", "tf-runner-ada");
        MissionEvidenceService.Actor person = new MissionEvidenceService.Actor("person", "who:" + "1".repeat(32));
        assertThat(MissionEvidenceService.reserved("mission.ended", MissionEvidenceService.Actor.SERVER, Map.of())).isTrue();
        assertThat(MissionEvidenceService.reserved("human.decision", person, Map.of("decision", "ALLOWED"))).isTrue();
        assertThat(MissionEvidenceService.reserved("note", MissionEvidenceService.Actor.SERVER, Map.of("kind", "witness"))).isTrue();
        assertThat(MissionEvidenceService.reserved("note", MissionEvidenceService.Actor.SERVER, Map.of("kind", "late-seal"))).isTrue();
        Map<String, Object> lost = new HashMap<>();
        lost.put("kind", "gap");
        lost.put("to", null);
        assertThat(MissionEvidenceService.reserved("note", MissionEvidenceService.Actor.SERVER, lost)).isTrue();
        assertThat(MissionEvidenceService.reserved("note", MissionEvidenceService.Actor.SERVER, Map.of("kind", "gap", "to", 9))).isFalse();
        assertThat(MissionEvidenceService.reserved("action.decided", MissionEvidenceService.Actor.SERVER, Map.of("effect", "ask"))).isFalse();
        assertThat(MissionEvidenceService.reserved("note", agent, Map.of("kind", "witness"))).isFalse();
        assertThat(MissionEvidenceService.reserved("mission.ended", agent, Map.of())).isFalse();
        assertThat(MissionEvidenceService.reserved("limit.reached", runner, Map.of())).isFalse();
    }

    @Test
    @DisplayName("N2 : le plafond atteint après la fin ne prétend pas arrêter la mission")
    void a_cap_after_the_end_stops_nothing() throws Exception {
        run.setStatus(DeliveryRunStatus.DONE);

        service.append(run, "note", new MissionEvidenceService.Actor("runner", "tf-runner-ada"), Map.of("kind", "changes"));

        assertThat(JSON.readTree(stored.getLast().getData()).get("stopped").asBoolean()).isFalse();
        verify(publisher, never()).publishEvent(any(EvidenceCapped.class));
    }

    @Test
    @DisplayName("N1, sonde D : au-delà du plafond, ce que dit l'agent ne laisse aucun texte à côté de la chaîne")
    void no_text_without_its_event_beyond_the_cap() {
        for (int n = 1; n <= 1_001; n++) {
            service.runnerEvent(run, new RunnerEventsRequest.Event("text", null, "Something to say, number " + n, null, null, n,
                null, null, null, null, null, null));
        }

        assertThat(texts).isEmpty();
        assertThat(after()).hasSize(1);
    }
}
