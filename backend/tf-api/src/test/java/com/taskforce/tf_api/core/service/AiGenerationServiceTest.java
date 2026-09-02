package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.AiGenerationKind;
import com.taskforce.tf_api.core.enums.AiGenerationSignal;
import com.taskforce.tf_api.core.model.AiGeneration;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AiGenerationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import com.taskforce.tf_api.core.service.AiGenerationService.Capture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AiGenerationService} (couche de capture du data flywheel).
 *
 * <p>Couvre les 3 contrats de la spec : {@code record} (insertion du draft / finalisation),
 * l'{@code edit_distance} (Levenshtein + dérivation du signal), et le fait que {@code record}
 * <b>ne jette JAMAIS</b> (opt-in coupé, entrée dégénérée, échec du repo). Le câblage aux 3 gates
 * est prouvé de bout en bout par le critère de fin (3 lignes en base), et par le verify de reco
 * dans {@code SmartAssignServiceTest}.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AiGenerationService")
class AiGenerationServiceTest {

    private static final long WS_ID = 100L;
    private static final long USER_ID = 7L;

    @Mock private AiGenerationRepository repository;
    @Mock private WorkspaceRepository workspaceRepository;
    @InjectMocks private AiGenerationService service;

    private AiGeneration open(AiGenerationKind kind, Map<String, Object> draft) {
        return AiGeneration.builder().kind(kind).draft(draft).build();
    }

    // =========================================================================
    @Nested
    @DisplayName("record (apprentissage activé)")
    class Record {

        @BeforeEach
        void learningOn() {
            when(workspaceRepository.findAiLearningEnabledById(WS_ID)).thenReturn(Optional.of(true));
            // Utilisé seulement quand une NOUVELLE ligne est créée (draft, ou finalisation sans ligne ouverte).
            lenient().when(workspaceRepository.getReferenceById(WS_ID))
                .thenReturn(Workspace.builder().id(WS_ID).build());
        }

        @Test
        @DisplayName("sans final ni signal -> insère une ligne ouverte (draft), signal + final null")
        void insertsOpenDraft() {
            service.record(Capture.builder()
                .workspaceId(WS_ID).kind(AiGenerationKind.SPEC).requestRef("WEB-1")
                .draft(Map.of("spec", "hello")).contextRefs(List.of(1L, 2L))
                .model("qwen").latencyMs(120).userId(USER_ID)
                .build());

            ArgumentCaptor<AiGeneration> captor = ArgumentCaptor.forClass(AiGeneration.class);
            verify(repository).save(captor.capture());
            AiGeneration row = captor.getValue();
            assertThat(row.getKind()).isEqualTo(AiGenerationKind.SPEC);
            assertThat(row.getRequestRef()).isEqualTo("WEB-1");
            assertThat(row.getContextRefs()).containsExactly(1L, 2L);
            assertThat(row.getModel()).isEqualTo("qwen");
            assertThat(row.getLatencyMs()).isEqualTo(120);
            assertThat(row.getFinalValue()).isNull();
            assertThat(row.getSignal()).isNull();
            assertThat(row.getCreatedBy()).isEqualTo("7"); // AuditableEntity.createdBy = id déclencheur
        }

        @Test
        @DisplayName("SPEC finalisée, texte inchangé -> ACCEPTED, edit_distance 0")
        void finalizeSpecAccepted() {
            AiGeneration row = open(AiGenerationKind.SPEC, Map.of("spec", "hello"));
            when(repository.findFirstByWorkspaceIdAndKindAndRequestRefAndFinalValueIsNullOrderByCreatedAtDesc(
                WS_ID, AiGenerationKind.SPEC, "WEB-1")).thenReturn(Optional.of(row));

            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SPEC).requestRef("WEB-1")
                .finalValue(Map.of("spec", "hello")).userId(USER_ID).build());

            verify(repository).save(row);
            assertThat(row.getSignal()).isEqualTo(AiGenerationSignal.ACCEPTED);
            assertThat(row.getEditDistance()).isZero();
        }

        @Test
        @DisplayName("SPEC finalisée, texte édité -> EDITED, edit_distance = Levenshtein")
        void finalizeSpecEdited() {
            AiGeneration row = open(AiGenerationKind.SPEC, Map.of("spec", "hello"));
            when(repository.findFirstByWorkspaceIdAndKindAndRequestRefAndFinalValueIsNullOrderByCreatedAtDesc(
                WS_ID, AiGenerationKind.SPEC, "WEB-1")).thenReturn(Optional.of(row));

            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SPEC).requestRef("WEB-1")
                .finalValue(Map.of("spec", "hallo")).userId(USER_ID).build());

            assertThat(row.getSignal()).isEqualTo(AiGenerationSignal.EDITED);
            assertThat(row.getEditDistance()).isEqualTo(1);
        }

        @Test
        @DisplayName("SMART_ASSIGN : assigné == reco -> ACCEPTED")
        void smartAssignAccepted() {
            AiGeneration row = open(AiGenerationKind.SMART_ASSIGN, Map.of("userId", 5L));
            when(repository.findFirstByWorkspaceIdAndKindAndRequestRefAndFinalValueIsNullOrderByCreatedAtDesc(
                WS_ID, AiGenerationKind.SMART_ASSIGN, "42")).thenReturn(Optional.of(row));

            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SMART_ASSIGN).requestRef("42")
                .finalValue(Map.of("userId", 5L)).finalizeOnly(true).userId(USER_ID).build());

            assertThat(row.getSignal()).isEqualTo(AiGenerationSignal.ACCEPTED);
            assertThat(row.getEditDistance()).isNull(); // pas de texte à comparer pour une assignation
        }

        @Test
        @DisplayName("SMART_ASSIGN : assigné != reco -> REJECTED")
        void smartAssignRejected() {
            AiGeneration row = open(AiGenerationKind.SMART_ASSIGN, Map.of("userId", 5L));
            when(repository.findFirstByWorkspaceIdAndKindAndRequestRefAndFinalValueIsNullOrderByCreatedAtDesc(
                WS_ID, AiGenerationKind.SMART_ASSIGN, "42")).thenReturn(Optional.of(row));

            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SMART_ASSIGN).requestRef("42")
                .finalValue(Map.of("userId", 9L)).finalizeOnly(true).userId(USER_ID).build());

            assertThat(row.getSignal()).isEqualTo(AiGenerationSignal.REJECTED);
        }

        @Test
        @DisplayName("finalizeOnly sans ligne ouverte -> aucune écriture (pas de ligne parasite)")
        void finalizeOnlyNoOpenRow() {
            when(repository.findFirstByWorkspaceIdAndKindAndRequestRefAndFinalValueIsNullOrderByCreatedAtDesc(
                WS_ID, AiGenerationKind.SMART_ASSIGN, "42")).thenReturn(Optional.empty());

            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SMART_ASSIGN).requestRef("42")
                .finalValue(Map.of("userId", 9L)).finalizeOnly(true).userId(USER_ID).build());

            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("DECISION (draft+final+signal fournis, sans ligne ouverte) -> insère une ligne complète")
        void insertsCompleteRow() {
            // findFirst non stubbé -> Optional.empty() par défaut Mockito ; finalizeOnly=false -> on crée.
            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.DECISION).requestRef("priority-1")
                .draft(Map.of("title", "T")).finalValue(Map.of("issueId", 9L))
                .signal(AiGenerationSignal.ACCEPTED).userId(USER_ID).build());

            ArgumentCaptor<AiGeneration> captor = ArgumentCaptor.forClass(AiGeneration.class);
            verify(repository).save(captor.capture());
            assertThat(captor.getValue().getSignal()).isEqualTo(AiGenerationSignal.ACCEPTED);
            assertThat(captor.getValue().getFinalValue()).containsEntry("issueId", 9L);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("opt-in + robustesse (ne jette jamais)")
    class Guards {

        @Test
        @DisplayName("apprentissage désactivé -> aucune capture")
        void learningDisabled() {
            when(workspaceRepository.findAiLearningEnabledById(WS_ID)).thenReturn(Optional.of(false));
            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SPEC)
                .draft(Map.of("spec", "x")).build());
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("workspace absent -> aucune capture")
        void workspaceMissing() {
            when(workspaceRepository.findAiLearningEnabledById(WS_ID)).thenReturn(Optional.empty());
            service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SPEC)
                .draft(Map.of("spec", "x")).build());
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("capture null ou dégénérée -> ne jette pas, aucune interaction")
        void badInputNoThrow() {
            assertThatCode(() -> service.record(null)).doesNotThrowAnyException();
            assertThatCode(() -> service.record(Capture.builder().kind(AiGenerationKind.SPEC).build()))
                .doesNotThrowAnyException(); // workspaceId null
            assertThatCode(() -> service.record(Capture.builder().workspaceId(WS_ID).build()))
                .doesNotThrowAnyException(); // kind null
            verifyNoInteractions(repository);
            verifyNoInteractions(workspaceRepository);
        }

        @Test
        @DisplayName("échec du repo -> avalé, aucune exception (le flux métier n'est jamais cassé)")
        void repoErrorNeverThrows() {
            when(workspaceRepository.findAiLearningEnabledById(WS_ID)).thenReturn(Optional.of(true));
            when(workspaceRepository.getReferenceById(WS_ID)).thenReturn(Workspace.builder().id(WS_ID).build());
            doThrow(new RuntimeException("db down")).when(repository).save(any());

            assertThatCode(() -> service.record(Capture.builder().workspaceId(WS_ID).kind(AiGenerationKind.SPEC)
                .draft(Map.of("spec", "x")).userId(USER_ID).build()))
                .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("purgeWorkspace délègue au repo et avale les erreurs")
        void purge() {
            when(repository.deleteByWorkspaceId(WS_ID)).thenReturn(3L);
            assertThat(service.purgeWorkspace(WS_ID)).isEqualTo(3L);

            doThrow(new RuntimeException("boom")).when(repository).deleteByWorkspaceId(999L);
            assertThat(service.purgeWorkspace(999L)).isZero();
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("levenshtein (edit_distance)")
    class Levenshtein {

        @ParameterizedTest(name = "d(\"{0}\",\"{1}\") = {2}")
        @CsvSource({
            "'','',0",
            "hello,hello,0",
            "hello,hallo,1",
            "kitten,sitting,3",
            "abc,'',3",
            "'',abc,3",
            "flaw,lawn,2"
        })
        @DisplayName("distance de Levenshtein")
        void computesDistance(String a, String b, int expected) {
            assertThat(AiGenerationService.levenshtein(a, b)).isEqualTo(expected);
        }
    }
}
