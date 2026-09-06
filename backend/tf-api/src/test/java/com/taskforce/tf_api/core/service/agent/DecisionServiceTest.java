package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.DecisionBrief;
import com.taskforce.tf_api.core.dto.response.DecisionBrief.Snapshot;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link DecisionService} (raisonnement OODA par projet) : repli déterministe,
 * analyse LLM (brief / question de clarification / échec), snapshot des métriques réelles.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("DecisionService")
class DecisionServiceTest {

    @Mock private BrainSearchService search;
    @Mock private IssueRepository issueRepository;
    @Mock private LlmClient llm;
    @Spy  private ObjectMapper objectMapper = new ObjectMapper();
    @InjectMocks private DecisionService service;

    private final Project project = Project.builder().id(1L).name("Web").identifier("WEB").build();

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(service, "model", "test-model");
    }

    private Snapshot snap(long total, long open, long inProgress, long completed, long overdue, long dueSoon) {
        return new Snapshot(total, open, inProgress, completed, overdue, dueSoon);
    }

    private void llmReturns(String json) {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(any(), any(), any(), anyBoolean(), any())).thenReturn(json);
    }

    @Nested
    @DisplayName("Repli déterministe (fondé sur les métriques)")
    class Fallback {

        @Test
        @DisplayName("snapshot chargé → situation chiffrée + 3 risques + priorité HIGH sur les retards")
        void loaded_snapshot() {
            DecisionBrief brief = service.fallbackBrief(project, snap(10, 5, 6, 3, 2, 1));

            assertThat(brief.mode()).isEqualTo("fallback");
            assertThat(brief.situation()).contains("Web").contains("30%").contains("en retard");
            assertThat(brief.risks()).hasSize(3);
            assertThat(brief.priorities()).hasSize(3);
            assertThat(brief.priorities().get(0).level()).isEqualTo("HIGH");
            assertThat(brief.priorities().get(0).title()).contains("en retard");
        }

        @Test
        @DisplayName("snapshot sain → un seul risque neutre + une priorité LOW")
        void clean_snapshot() {
            DecisionBrief brief = service.fallbackBrief(project, snap(5, 2, 1, 3, 0, 0));

            assertThat(brief.risks()).hasSize(1);
            assertThat(brief.risks().get(0)).contains("Pas de signal");
            assertThat(brief.priorities()).hasSize(1);
            assertThat(brief.priorities().get(0).level()).isEqualTo("LOW");
        }
    }

    @Nested
    @DisplayName("analyze()")
    class Analyze {

        @Test
        @DisplayName("LLM non configuré → repli fallback, pas de question")
        void llm_absent() {
            when(llm.isConfigured()).thenReturn(false);

            DecisionService.Analysis a = service.analyze(project, snap(4, 2, 1, 1, 0, 0), List.of(), false, null, false);

            assertThat(a.needsInput()).isFalse();
            assertThat(a.brief()).isNotNull();
            assertThat(a.brief().mode()).isEqualTo("fallback");
        }

        @Test
        @DisplayName("LLM produit un brief JSON → situation + risques + priorités (mode generated)")
        void llm_generates() {
            llmReturns("{\"situation\":\"Sur les rails\",\"risks\":[\"charge\"],"
                + "\"priorities\":[{\"title\":\"Faire X\",\"rationale\":\"maintenant\",\"level\":\"HIGH\"}]}");

            DecisionService.Analysis a = service.analyze(project, snap(4, 2, 1, 1, 0, 0), List.of(), false, null, false);

            assertThat(a.needsInput()).isFalse();
            assertThat(a.brief().mode()).isEqualTo("generated");
            assertThat(a.brief().situation()).isEqualTo("Sur les rails");
            assertThat(a.brief().risks()).containsExactly("charge");
            assertThat(a.brief().priorities()).hasSize(1);
            assertThat(a.brief().priorities().get(0).level()).isEqualTo("HIGH");
        }

        @Test
        @DisplayName("mode approfondi : le LLM pose une question → Analysis porteuse de la question")
        void llm_asks_question() {
            llmReturns("{\"question\":\"Quel objectif prioritaire ce sprint ?\"}");

            DecisionService.Analysis a = service.analyze(project, snap(4, 2, 1, 1, 0, 0), List.of(), true, null, true);

            assertThat(a.needsInput()).isTrue();
            assertThat(a.question()).contains("objectif prioritaire");
            assertThat(a.brief()).isNull();
        }

        @Test
        @DisplayName("LLM en échec → repli fallback (jamais d'exception propagée)")
        void llm_throws() {
            when(llm.isConfigured()).thenReturn(true);
            when(llm.chatCompletion(any(), any(), any(), anyBoolean(), any())).thenThrow(new RuntimeException("timeout"));

            DecisionService.Analysis a = service.analyze(project, snap(4, 2, 1, 1, 0, 0), List.of(), false, null, false);

            assertThat(a.brief().mode()).isEqualTo("fallback");
        }

        @Test
        @DisplayName("réponse LLM vide (ni situation ni priorité) → repli fallback")
        void llm_empty() {
            llmReturns("{}");

            DecisionService.Analysis a = service.analyze(project, snap(4, 2, 1, 1, 0, 0), List.of(), false, null, false);

            assertThat(a.brief().mode()).isEqualTo("fallback");
        }

        @Test
        @DisplayName("priorités : plafonnées à 3 + niveau invalide normalisé en MEDIUM")
        void priorities_capped_and_level_normalized() {
            llmReturns("{\"situation\":\"x\",\"priorities\":["
                + "{\"title\":\"a\",\"level\":\"HIGH\"},{\"title\":\"b\",\"level\":\"WTF\"},"
                + "{\"title\":\"c\",\"level\":\"LOW\"},{\"title\":\"d\",\"level\":\"HIGH\"}]}");

            DecisionService.Analysis a = service.analyze(project, snap(4, 2, 1, 1, 0, 0), List.of(), false, null, false);

            assertThat(a.brief().priorities()).hasSize(3);            // 4 fournies → plafonnées à 3
            assertThat(a.brief().priorities().get(1).level()).isEqualTo("MEDIUM"); // "WTF" → MEDIUM
        }
    }

    @Test
    @DisplayName("snapshot() agrège les compteurs réels + classe en retard / à échéance")
    void snapshot_aggregates() {
        when(issueRepository.countByProjectId(1L)).thenReturn(10L);
        when(issueRepository.countOpenIssues(1L)).thenReturn(5L);
        when(issueRepository.findByProjectIdAndStatusCategory(1L, IssueStatusCategory.STARTED))
            .thenReturn(Collections.nCopies(6, Issue.builder().build()));
        when(issueRepository.findByProjectIdAndStatusCategory(1L, IssueStatusCategory.COMPLETED))
            .thenReturn(Collections.nCopies(3, Issue.builder().build()));
        Issue overdue = Issue.builder().project(project).dueDate(LocalDate.now().minusDays(2)).build();
        Issue soon = Issue.builder().project(project).dueDate(LocalDate.now().plusDays(2)).build();
        when(issueRepository.findOpenAssignedDueOnOrBefore(any())).thenReturn(List.of(overdue, soon));

        Snapshot s = service.snapshot(1L);

        assertThat(s.total()).isEqualTo(10);
        assertThat(s.open()).isEqualTo(5);
        assertThat(s.inProgress()).isEqualTo(6);
        assertThat(s.completed()).isEqualTo(3);
        assertThat(s.overdue()).isEqualTo(1);
        assertThat(s.dueSoon()).isEqualTo(1);
    }

    @Test
    @DisplayName("retrieveContext() délègue la recherche sémantique au Brain OS")
    void retrieve_context_delegates() {
        KnowledgeNode node = KnowledgeNode.builder().id(9L).title("Vision").build();
        when(search.retrieveRelevant(eq(7L), any(), anyInt())).thenReturn(List.of(node));

        assertThat(service.retrieveContext(7L, "Web")).containsExactly(node);
    }

    @Test
    @DisplayName("Analysis.needsInput() : vrai seulement pour une question non vide")
    void analysis_needs_input() {
        assertThat(new DecisionService.Analysis(null, "q ?").needsInput()).isTrue();
        assertThat(new DecisionService.Analysis(null, "   ").needsInput()).isFalse();
        assertThat(new DecisionService.Analysis(
            new DecisionBrief("s", List.of(), List.of(), snap(0, 0, 0, 0, 0, 0), "x"), null).needsInput()).isFalse();
    }
}
