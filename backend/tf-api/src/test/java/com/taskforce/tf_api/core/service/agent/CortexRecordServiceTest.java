package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.model.CortexRecord;
import com.taskforce.tf_api.core.model.CortexRecordEvent;
import com.taskforce.tf_api.core.repository.CortexRecordEventRepository;
import com.taskforce.tf_api.core.repository.CortexRecordRepository;
import com.taskforce.tf_api.core.service.agent.CortexRecordService.Actor;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Le dossier d'une réponse de Cortex (R35) : chaîné comme celui d'un agent délégué, vérifiable à l'export, borné,
 * et l'accord de la personne ne prolonge qu'une proposition qui l'attend.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Dossier d'une réponse de Cortex")
class CortexRecordServiceTest {

    @Mock private CortexRecordRepository recordRepository;
    @Mock private CortexRecordEventRepository eventRepository;

    /** Ce que la base garde : les dossiers, et les événements d'un dossier, dans l'ordre. */
    private final Map<UUID, CortexRecord> records = new HashMap<>();
    private final List<CortexRecordEvent> stored = new ArrayList<>();
    private final AgentContext ctx = new AgentContext("acme", 1L, 7L);
    private CortexRecordService service;

    @BeforeEach
    void setUp() {
        service = new CortexRecordService(recordRepository, eventRepository);
        lenient().when(recordRepository.save(any())).thenAnswer(inv -> {
            CortexRecord record = inv.getArgument(0);
            records.put(record.getId(), record);
            return record;
        });
        lenient().when(recordRepository.findByIdForUpdate(any()))
            .thenAnswer(inv -> Optional.ofNullable(records.get(inv.<UUID>getArgument(0))));
        lenient().when(eventRepository.save(any())).thenAnswer(inv -> {
            stored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        lenient().when(eventRepository.findTopByRecordIdOrderBySeqDesc(any()))
            .thenAnswer(inv -> stored.isEmpty() ? Optional.empty() : Optional.of(stored.getLast()));
        lenient().when(eventRepository.findByRecordIdOrderBySeqAsc(any())).thenAnswer(inv -> List.copyOf(stored));
    }

    /** Une réponse où Cortex a proposé une note : la demande, la décision des règles, le résultat en attente. */
    private UUID proposedNote() {
        UUID id = service.open(ctx, "Write the release notes", Map.of());
        service.append(id, "action.requested", Actor.CORTEX, Map.of("tool", "create_note", "arguments", "{}"));
        service.append(id, "action.decided", Actor.rule("propose-knowledge"), Map.of("effect", "ask"));
        service.append(id, "action.result", Actor.SERVER, Map.of("tool", "create_note", "status", "pending", "output", "Proposed"));
        return id;
    }

    @Test
    @DisplayName("le dossier s'ouvre sur la question, posée par la personne à l'agent interne")
    void opens_on_the_question() {
        UUID id = service.open(ctx, "Write the release notes", Map.of());

        assertThat(records.get(id).getWorkspaceId()).isEqualTo(1L);
        assertThat(records.get(id).getUserId()).isEqualTo(7L);
        assertThat(stored).singleElement().satisfies(event -> {
            assertThat(event.getType()).isEqualTo("mission.started");
            assertThat(event.getActorKind()).isEqualTo("person");
            assertThat(event.getActorId()).isEqualTo("user-7");
            assertThat(event.getData()).isEqualTo("{\"agent\":\"internal\",\"question\":\"Write the release notes\"}");
        });
    }

    @Test
    @DisplayName("chaque événement porte l'empreinte du précédent, la racine suit le dernier, l'export se vérifie")
    void events_are_chained() {
        UUID id = proposedNote();

        assertThat(stored).extracting(CortexRecordEvent::getSeq).containsExactly(1, 2, 3, 4);
        assertThat(stored.getFirst().getPrev()).isEqualTo(EvidenceChain.ZERO_HASH);
        assertThat(stored.get(3).getPrev()).isEqualTo(stored.get(2).getHash());
        assertThat(records.get(id).getRoot()).isEqualTo(stored.getLast().getHash());
        assertThat(EvidenceChain.firstBrokenLink(service.events(id))).isEqualTo(-1);
    }

    @Test
    @DisplayName("une donnée changée en base se voit à l'export, au bon endroit")
    void a_change_shows() {
        UUID id = proposedNote();
        CortexRecordEvent result = stored.get(3);
        stored.set(3, CortexRecordEvent.builder().recordId(id).seq(4).at(result.getAt()).type(result.getType())
            .actorKind(result.getActorKind()).actorId(result.getActorId())
            .data(result.getData().replace("pending", "success")).prev(result.getPrev()).hash(result.getHash()).build());

        assertThat(EvidenceChain.firstBrokenLink(service.events(id))).isEqualTo(3);
    }

    @Test
    @DisplayName("un dossier plein ne prend plus rien")
    void a_full_record_takes_nothing_more() {
        UUID id = service.open(ctx, "Write the release notes", Map.of());
        stored.add(CortexRecordEvent.builder().recordId(id).seq(CortexRecordService.MAX_EVENTS)
            .hash("sha256:" + "b".repeat(64)).build());

        assertThat(service.append(id, "note", Actor.SERVER, Map.of("text", "one more"))).isEmpty();
        assertThat(stored).hasSize(2);
    }

    @Test
    @DisplayName("l'accord prolonge la proposition qui l'attend, une seule fois, avec les arguments accordés")
    void an_approval_extends_a_waiting_proposal_once() {
        UUID id = proposedNote();

        assertThat(service.approve(id, "create_note", 7L, "{\"title\":\"T\"}")).isTrue();
        assertThat(stored.getLast().getType()).isEqualTo("human.decision");
        assertThat(stored.getLast().getActorId()).isEqualTo("user-7");
        assertThat(stored.getLast().getData())
            .isEqualTo("{\"arguments\":\"{\\\"title\\\":\\\"T\\\"}\",\"decision\":\"approved\",\"tool\":\"create_note\"}");
        assertThat(service.approve(id, "create_note", 7L, "{\"title\":\"T\"}")).isFalse(); // un deuxième clic
    }

    @ParameterizedTest(name = "résultat {1} de {0}, accord de create_note : {2}")
    @CsvSource({
        "create_note,    pending, true",  // proposée, elle attend
        "create_note,    success, false", // lancée sans accord : rien n'attend
        "create_note,    error,   false",
        "create_project, pending, false", // une autre action attend, pas celle-ci
    })
    void only_a_waiting_proposal_can_be_approved(String tool, String status, boolean approvable) {
        UUID id = service.open(ctx, "Write the release notes", Map.of());
        service.append(id, "action.result", Actor.SERVER, Map.of("tool", tool, "status", status, "output", "..."));

        assertThat(service.approve(id, "create_note", 7L, "{}")).isEqualTo(approvable);
    }

    @Test
    @DisplayName("un dossier introuvable ne prend aucun accord")
    void approval_on_a_missing_record() {
        UUID missing = UUID.randomUUID();

        assertThatThrownBy(() -> service.approve(missing, "create_note", 7L, "{}"))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("le dossier n'appartient qu'à la personne qui a posé la question, dans son espace")
    void owns_only_its_own_record() {
        UUID id = UUID.randomUUID();
        when(recordRepository.findByIdAndWorkspaceIdAndUserId(id, 1L, 7L)).thenReturn(Optional.of(new CortexRecord()));
        when(recordRepository.findByIdAndWorkspaceIdAndUserId(id, 1L, 8L)).thenReturn(Optional.empty());

        assertThat(service.owns(id, ctx)).isTrue();
        assertThat(service.owns(id, new AgentContext("acme", 1L, 8L))).isFalse();
    }

    @ParameterizedTest(name = "{0} caractères gardés sur {1}")
    @CsvSource({"0, 0", "2000, 2000", "2003, 2001"})
    void a_long_text_is_cut(int kept, int length) {
        assertThat(CortexRecordService.shorten("x".repeat(length))).hasSize(kept);
    }

    @Test
    @DisplayName("un texte absent est gardé vide")
    void a_missing_text_is_empty() {
        assertThat(CortexRecordService.shorten(null)).isEmpty();
    }

    @Test
    @DisplayName("le dossier s'ouvre aussi sur ce qui a répondu ; une valeur absente n'y entre pas, la question reste")
    void opens_with_what_answered() {
        Map<String, Object> origin = new LinkedHashMap<>();
        origin.put("model", "qwen3:8b");
        origin.put("tier", "fast");
        origin.put("notes", List.of(Map.of("id", 12, "title", "Release plan")));
        origin.put("absent", null);
        origin.put("question", "not this one");

        service.open(ctx, "Write the release notes", origin);

        assertThat(stored.getFirst().getData()).isEqualTo("{\"agent\":\"internal\",\"model\":\"qwen3:8b\","
            + "\"notes\":[{\"id\":12,\"title\":\"Release plan\"}],\"question\":\"Write the release notes\",\"tier\":\"fast\"}");
    }

    // -------------------------------------------------------------------------
    // « Undo » (R77, séance n°13)
    // -------------------------------------------------------------------------

    private UUID createdProject() {
        UUID id = service.open(ctx, "Create a project Pricing", Map.of());
        service.append(id, "action.result", Actor.SERVER,
            Map.of("tool", "create_project", "status", "success", "output", "Project created in TaskForce: PRICING \"Pricing\" (id 27)."));
        return id;
    }

    @Test
    @DisplayName("undo défait la dernière création réussie, une seule fois, et le garde au dossier")
    void undo_runs_once_and_is_kept() {
        UUID id = createdProject();

        assertThat(service.undo(id, "create_project", 7L, created -> "Removed from: " + created))
            .contains("Removed from: Project created in TaskForce: PRICING \"Pricing\" (id 27).");
        assertThat(service.undo(id, "create_project", 7L, created -> "again")).isEmpty(); // un deuxième clic
        assertThat(stored).extracting(CortexRecordEvent::getType).endsWith("human.decision", "action.result");
        assertThat(stored.getLast().getData()).contains("\"status\":\"undone\"");
    }

    @Test
    @DisplayName("undo sans création réussie de cet outil : rien à défaire")
    void nothing_to_undo() {
        UUID id = proposedNote();

        assertThat(service.undo(id, "create_note", 7L, created -> "never")).isEmpty();
        assertThat(service.undo(id, "create_project", 7L, created -> "never")).isEmpty();
    }

    @Test
    @DisplayName("un undo refusé par l'outil ne laisse rien au dossier, et redit pourquoi")
    void a_refused_undo_keeps_nothing() {
        UUID id = createdProject();
        int before = stored.size();

        assertThatThrownBy(() -> service.undo(id, "create_project", 7L, created -> {
            throw new BusinessException("PRICING has issues now");
        })).isInstanceOf(BusinessException.class).hasMessage("PRICING has issues now");
        assertThat(stored).hasSize(before);
    }

    @Test
    @DisplayName("une décision « undo » ne compte pas comme un accord")
    void an_undo_is_not_an_approval() {
        UUID id = proposedNote();
        service.append(id, "human.decision", Actor.person(7L), Map.of("tool", "create_note", "decision", "undo"));

        assertThat(service.approve(id, "create_note", 7L, "{}")).isTrue();
    }
}
