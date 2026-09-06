package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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
import com.taskforce.tf_api.core.dto.response.IssueSpecDraft;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueType;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectLabel;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueTypeRepository;
import com.taskforce.tf_api.core.repository.ProjectLabelRepository;
import com.taskforce.tf_api.core.service.AiGenerationService;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.SmartAssignService;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link IssueAiService#generateSpec} : génération assistée de spec (RAG + LLM),
 * repli déterministe sans LLM, et enrichissement borné (labels/type/priorité restreints au projet).
 * Le wrapper de quota {@link AiMeter#metered} est stubé pour invoquer l'appel réel.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("IssueAiService — generateSpec")
class IssueAiServiceTest {

    @Mock private BrainAccessGuard access;
    @Mock private BrainSearchService search;
    @Mock private KnowledgeService knowledgeService;
    @Mock private IssueService issueService;
    @Mock private SmartAssignService smartAssignService;
    @Mock private IssueRepository issueRepository;
    @Mock private ProjectLabelRepository projectLabelRepository;
    @Mock private IssueTypeRepository issueTypeRepository;
    @Mock private LlmClient llm;
    @Spy  private ObjectMapper objectMapper = new ObjectMapper();
    @Mock private AiMeter aiMeter;
    @Mock private AiGenerationService aiGenerationService;
    @InjectMocks private IssueAiService service;

    private final Workspace ws = Workspace.builder().id(5L).slug("acme").build();
    private final Project project = Project.builder().id(1L).identifier("WEB").workspace(ws).build();
    private final Issue issue = Issue.builder()
        .id(10L).project(project).sequenceNumber(7).title("Login cassé").description("500 au login").build();

    @BeforeEach
    void setup() throws Exception {
        ReflectionTestUtils.setField(service, "model", "test-model");
        when(access.resolveAndAuthorize("acme", 9L)).thenReturn(ws);
        when(issueRepository.findById(10L)).thenReturn(Optional.of(issue));
        when(search.retrieveRelevantScored(anyLong(), any(), anyInt())).thenReturn(List.of());
        when(projectLabelRepository.findByProjectIdOrderByNameAsc(1L)).thenReturn(List.of());
        when(issueTypeRepository.findByProjectIdOrderByName(1L)).thenReturn(List.of());
        // metered() = simple pass-through du quota : on invoque l'appel IA fourni.
        when(aiMeter.metered(anyLong(), any())).thenAnswer(inv -> ((AiMeter.AiCall<?>) inv.getArgument(1)).call());
    }

    private void llmReturns(String json) {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(any(), any(), any(), anyBoolean(), any())).thenReturn(json);
    }

    @Test
    @DisplayName("LLM non configuré → brouillon déterministe (mode fallback, découpage par défaut)")
    void llm_absent_fallback() {
        when(llm.isConfigured()).thenReturn(false);

        IssueSpecDraft draft = service.generateSpec("acme", 1L, 10L, 9L, false);

        assertThat(draft.mode()).isEqualTo("fallback");
        assertThat(draft.spec()).contains("500 au login");
        assertThat(draft.breakdown()).hasSize(4);
    }

    @Test
    @DisplayName("LLM produit une spec → mode generated + enrichissement borné au projet")
    void llm_generates_and_filters() {
        when(projectLabelRepository.findByProjectIdOrderByNameAsc(1L))
            .thenReturn(List.of(ProjectLabel.builder().name("bug").build(),
                                ProjectLabel.builder().name("feature").build()));
        when(issueTypeRepository.findByProjectIdOrderByName(1L))
            .thenReturn(List.of(IssueType.builder().name("Task").build()));
        llmReturns("{\"spec\":\"## Contexte\",\"executionPrompt\":\"Implémente\",\"breakdown\":[\"étape 1\"],"
            + "\"labels\":[\"bug\",\"inconnu\"],\"storyPoints\":5,\"priority\":\"high\",\"type\":\"task\"}");

        IssueSpecDraft draft = service.generateSpec("acme", 1L, 10L, 9L, false);

        assertThat(draft.mode()).isEqualTo("generated");
        assertThat(draft.labels()).containsExactly("bug");        // "inconnu" filtré (hors labels du projet)
        assertThat(draft.storyPoints()).isEqualTo(5);
        assertThat(draft.priority()).isEqualTo("HIGH");           // "high" normalisé
        assertThat(draft.type()).isEqualTo("Task");               // "task" recadré sur le type exact
    }

    @Test
    @DisplayName("priorité LLM invalide → ignorée (null) plutôt qu'inventée")
    void invalid_priority_dropped() {
        llmReturns("{\"spec\":\"x\",\"executionPrompt\":\"y\",\"priority\":\"SUPER_URGENT\"}");

        IssueSpecDraft draft = service.generateSpec("acme", 1L, 10L, 9L, false);

        assertThat(draft.priority()).isNull();
    }

    @Test
    @DisplayName("LLM en échec → repli déterministe (jamais d'exception propagée)")
    void llm_throws_fallback() {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(any(), any(), any(), anyBoolean(), any())).thenThrow(new RuntimeException("down"));

        IssueSpecDraft draft = service.generateSpec("acme", 1L, 10L, 9L, false);

        assertThat(draft.mode()).isEqualTo("fallback");
    }

    @Test
    @DisplayName("issue introuvable → ResourceNotFoundException")
    void issue_not_found() {
        when(issueRepository.findById(10L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.generateSpec("acme", 1L, 10L, 9L, false))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("issue d'un autre projet → ResourceNotFoundException (pas de fuite inter-projets)")
    void issue_wrong_project() {
        assertThatThrownBy(() -> service.generateSpec("acme", 99L, 10L, 9L, false))
            .isInstanceOf(ResourceNotFoundException.class);
    }
}
