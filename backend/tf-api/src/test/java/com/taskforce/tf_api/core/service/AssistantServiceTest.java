package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AssistantService} (assistant IA workspace). Repos + Groq mockés.
 * Couvre la réponse LLM (nominal) et le repli gracieux quand Groq est indisponible.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AssistantService")
class AssistantServiceTest {

    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private IssueRepository issueRepository;
    @Mock private GroqService groqService;
    @Mock private BrainSearchService brainSearchService;

    @InjectMocks private AssistantService service;

    private static final String SLUG = "acme";

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "assistantModel", "llama-model");
        Workspace ws = Workspace.builder().id(1L).slug(SLUG).name("Acme").build();
        lenient().when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(ws));
        lenient().when(brainSearchService.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        lenient().when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        lenient().when(workspaceMemberRepository.findByWorkspaceId(anyLong())).thenReturn(List.of());
    }

    @Test
    @DisplayName("chat renvoie la réponse du LLM quand Groq est disponible")
    void chat_returns_llm_answer() {
        when(groqService.chatCompletion(anyString(), anyString(), anyString(), anyBoolean()))
            .thenReturn("Voici la réponse IA");

        assertThat(service.chat(SLUG, "Comment ça va ?")).isEqualTo("Voici la réponse IA");
    }

    @Test
    @DisplayName("chat renvoie un repli utile quand Groq échoue (pas de 500)")
    void chat_fallback_when_groq_fails() {
        when(groqService.chatCompletion(any(), any(), any(), anyBoolean()))
            .thenThrow(new RuntimeException("groq down"));

        assertThat(service.chat(SLUG, "question")).isNotBlank();
    }

    @Test
    @DisplayName("chat lève ResourceNotFoundException si le workspace est introuvable")
    void chat_workspace_not_found() {
        when(workspaceRepository.findBySlug("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.chat("nope", "q")).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("chat enrichit le prompt système avec membres, projets, métriques, charge et issues récentes")
    void chat_builds_rich_system_prompt() {
        var user = com.taskforce.tf_api.core.model.User.builder()
            .id(7L).displayName("Alice").email("a@x.io").build();
        var member = com.taskforce.tf_api.core.model.WorkspaceMember.builder()
            .user(user).role(com.taskforce.tf_api.core.enums.WorkspaceRole.OWNER).build();
        var project = com.taskforce.tf_api.core.model.Project.builder()
            .id(3L).name("App").identifier("APP").build();

        when(workspaceMemberRepository.findByWorkspaceId(anyLong())).thenReturn(List.of(member));
        when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of(project));
        when(issueRepository.countByProjectId(3L)).thenReturn(10L);
        when(issueRepository.countOpenIssues(3L)).thenReturn(4L);
        when(issueRepository.countCreatedBetween(any(), any(), any())).thenReturn(2L);
        when(issueRepository.countCompletedBetween(any(), any(), any())).thenReturn(3L);
        when(issueRepository.countOpenIssuesGroupedByAssignee(any()))
            .thenReturn(List.<Object[]>of(new Object[]{7L, 4L}));

        var status = com.taskforce.tf_api.core.model.IssueStatus.builder().name("Todo").build();
        var issue = com.taskforce.tf_api.core.model.Issue.builder()
            .project(project).status(status).sequenceNumber(1).title("Bug")
            .priority(com.taskforce.tf_api.core.enums.IssuePriority.HIGH).build();
        when(issueRepository.findByProjectIdOrderBySequenceNumberDesc(org.mockito.ArgumentMatchers.eq(3L), any()))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of(issue)));

        // Nœud Brain OS pertinent → couvre brainContextBlock
        var node = com.taskforce.tf_api.core.model.KnowledgeNode.builder()
            .type(com.taskforce.tf_api.core.enums.NodeType.DECISION)
            .domain(com.taskforce.tf_api.core.enums.NodeDomain.PROJET)
            .title("Choix techno").content("On utilise Spring Boot 4").build();
        when(brainSearchService.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of(node));

        when(groqService.chatCompletion(anyString(), anyString(), anyString(), anyBoolean())).thenReturn("OK");

        assertThat(service.chat(SLUG, "combien d'issues ?")).isEqualTo("OK");
    }

    @Test
    @DisplayName("fallback expose les métriques et notes Brain OS quand Groq échoue avec des données")
    void chat_fallback_with_data_and_notes() {
        var project = com.taskforce.tf_api.core.model.Project.builder().id(3L).name("App").identifier("APP").build();
        when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of(project));
        var node = com.taskforce.tf_api.core.model.KnowledgeNode.builder()
            .type(com.taskforce.tf_api.core.enums.NodeType.RUNBOOK)
            .domain(com.taskforce.tf_api.core.enums.NodeDomain.PRODUIT)
            .title("Runbook déploiement").build();
        when(brainSearchService.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of(node));
        when(groqService.chatCompletion(any(), any(), any(), anyBoolean()))
            .thenThrow(new RuntimeException("groq down"));

        assertThat(service.chat(SLUG, "q")).contains("Runbook déploiement");
    }
}
