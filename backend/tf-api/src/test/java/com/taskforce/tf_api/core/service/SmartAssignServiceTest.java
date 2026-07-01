package com.taskforce.tf_api.core.service;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.SmartAssignPreviewRequest;
import com.taskforce.tf_api.core.dto.response.BulkSmartAssignItemResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignCandidateResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectLabel;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link SmartAssignService} (B-T2, cœur du différenciateur).
 *
 * <p>Couvre : résolution des candidats (projet public vs privé), scoring/ranking Java
 * (labels, charge/disponibilité), repli sans Groq, garde-fous « montée en compétence »,
 * persistance d'{@code assignment_events} (recommend) vs preview/redistribution, IDOR
 * (projet/issue hors workspace) et autorisation (non-membre / workspace introuvable).</p>
 *
 * <p>Note technique : le service utilise un vrai {@link ObjectMapper} (parsing Groq + sérialisation
 * JSON), donc on l'instancie à la main plutôt que via {@code @InjectMocks}. Le {@link JdbcTemplate}
 * est mocké ; ses 4 sous-requêtes sont différenciées par un fragment de SQL ({@code contains(...)}).
 * Le {@code RowMapper} n'étant jamais exécuté par le mock, on renvoie directement la « ligne »
 * attendue (ex. le texte JSON des skills).</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("SmartAssignService")
class SmartAssignServiceTest {

    private static final String SLUG = "ws-demo";
    private static final long WS_ID = 100L;
    private static final long PROJECT_ID = 30L;
    private static final long REQUESTER = 1L;

    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private ProjectMemberRepository projectMemberRepository;
    @Mock private IssueRepository issueRepository;
    @Mock private GroqService groqService;
    @Mock private JdbcTemplate jdbcTemplate;

    private SmartAssignService service;

    private Workspace workspace;
    private Project project;

    @BeforeEach
    void setUp() {
        // ObjectMapper réel — le service parse la réponse Groq et sérialise les payloads JSON.
        service = new SmartAssignService(
            workspaceRepository, workspaceMemberRepository, projectRepository,
            projectMemberRepository, issueRepository, groqService, jdbcTemplate, new ObjectMapper());
        ReflectionTestUtils.setField(service, "modelName", "test-model");

        workspace = Workspace.builder().id(WS_ID).slug(SLUG).name("Demo").build();
        // public → resolveCandidates lit les membres du workspace (une seule source à stubber).
        project = Project.builder().id(PROJECT_ID).name("Infra").workspace(workspace).isPublic(true).build();

        // Défauts JDBC (lenient) : profils vides, pas d'historique, complexité habituelle 0.
        lenient().doReturn(List.of()).when(jdbcTemplate)
            .query(contains("skills_json"), any(RowMapper.class), any(), any());
        lenient().doReturn(List.of()).when(jdbcTemplate)
            .query(contains("capacity_hours_per_week"), any(RowMapper.class), any(), any());
        lenient().doReturn(List.of()).when(jdbcTemplate)
            .query(contains("assignment_events"), any(RowMapper.class), any(), any());
        lenient().doReturn(0.0).when(jdbcTemplate)
            .queryForObject(contains("story_points"), eq(Double.class), any(), any());

        // Charge cross-projets par défaut : aucune issue ouverte pour chaque candidat.
        lenient().when(issueRepository.findByWorkspaceSlugAndAssigneeId(anyString(), anyLong()))
            .thenReturn(List.of());

        // Groq renvoie par défaut un JSON vide et valide → ranking déterministe piloté par les règles Java.
        lenient().when(groqService.chatCompletion(any(), any(), any(), anyBoolean()))
            .thenReturn("{\"scores\":[]}");
    }

    // ---- Fixtures -----------------------------------------------------------

    private User user(long id, String name) {
        return User.builder().id(id).email(name.toLowerCase() + "@ex.dev").displayName(name).isActive(true).build();
    }

    private WorkspaceMember member(User u) {
        return WorkspaceMember.builder().user(u).build();
    }

    private ProjectLabel label(String name) {
        return ProjectLabel.builder().name(name).build();
    }

    private Issue openIssue(long id, int storyPoints, IssueStatusCategory category) {
        IssueStatus status = IssueStatus.builder().category(category).build();
        return Issue.builder().id(id).title("Open " + id).project(project)
            .status(status).priority(IssuePriority.MEDIUM).storyPoints(storyPoints).build();
    }

    /** Stub le profil (skills) d'un candidat précis (override du défaut vide). */
    private void stubSkills(long userId, String... skills) {
        String json = "[" + Arrays.stream(skills).map(s -> "\"" + s + "\"").collect(Collectors.joining(",")) + "]";
        doReturn(List.of(json)).when(jdbcTemplate)
            .query(contains("skills_json"), any(RowMapper.class), eq(WS_ID), eq(userId));
    }

    private void stubWorkspaceMembers(User... users) {
        when(workspaceMemberRepository.findByWorkspaceId(WS_ID))
            .thenReturn(Arrays.stream(users).map(this::member).toList());
    }

    private void stubResolvedContext() {
        when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS_ID, REQUESTER)).thenReturn(true);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
    }

    private SmartAssignPreviewRequest previewRequest(IssuePriority priority, String... labels) {
        SmartAssignPreviewRequest req = new SmartAssignPreviewRequest();
        req.setTitle("Fix login bug");
        req.setDescription("Users cannot authenticate");
        req.setLabels(labels.length == 0 ? null : List.of(labels));
        req.setPriority(priority);
        return req;
    }

    // =========================================================================
    @Nested
    @DisplayName("preview — scoring & ranking")
    class Preview {

        @Test
        @DisplayName("classe en tête le candidat dont les compétences matchent les labels")
        void should_rank_skill_match_first() {
            User alice = user(10L, "Alice");   // skills [java] → match
            User bob = user(11L, "Bob");       // aucun skill
            stubResolvedContext();
            stubWorkspaceMembers(alice, bob);
            stubSkills(10L, "java");

            SmartAssignResponse res = service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM, "java"));

            assertThat(res.getRecommended()).isNotNull();
            assertThat(res.getRecommended().getUserId()).isEqualTo(10L);
            assertThat(res.getRecommended().getLabelMatchCount()).isEqualTo(1);
            assertThat(res.getRecommended().getMatchedSkills()).containsExactly("java");
            assertThat(res.getRecommended().getFactors()).anyMatch(f -> f.contains("label match"));
            assertThat(res.getAlternatives()).extracting(SmartAssignCandidateResponse::getUserId).containsExactly(11L);
            assertThat(res.isFallbackUsed()).isFalse();
            assertThat(res.getStrategy()).contains("ai-semantic");
        }

        @Test
        @DisplayName("un membre surchargé (dispo/charge basses) passe derrière un membre libre")
        void should_rank_available_member_over_overloaded() {
            User loaded = user(10L, "Loaded");   // 30 points ouverts cross-projets
            User fresh = user(11L, "Fresh");     // aucune charge
            stubResolvedContext();
            stubWorkspaceMembers(loaded, fresh);
            when(issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, 10L)).thenReturn(List.of(
                openIssue(1L, 10, IssueStatusCategory.STARTED),
                openIssue(2L, 10, IssueStatusCategory.UNSTARTED),
                openIssue(3L, 10, IssueStatusCategory.BACKLOG)));

            SmartAssignResponse res = service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM));

            assertThat(res.getRecommended().getUserId()).isEqualTo(11L);
            // le surchargé : disponibilité et charge écrasées à 0, 3 tâches ouvertes comptées
            SmartAssignCandidateResponse loadedResp = res.getAlternatives().get(0);
            assertThat(loadedResp.getUserId()).isEqualTo(10L);
            assertThat(loadedResp.getOpenIssues()).isEqualTo(3);
            assertThat(loadedResp.getAvailability()).isZero();
            assertThat(loadedResp.getWorkloadScore()).isZero();
            // le libre : pleine disponibilité
            assertThat(res.getRecommended().getAvailability()).isEqualTo(100);
        }

        @Test
        @DisplayName("les issues terminées/annulées ne comptent pas dans la charge")
        void should_ignore_completed_and_cancelled_in_workload() {
            User u = user(10L, "Solo");
            stubResolvedContext();
            stubWorkspaceMembers(u);
            when(issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, 10L)).thenReturn(List.of(
                openIssue(1L, 5, IssueStatusCategory.COMPLETED),   // ignorée
                openIssue(2L, 5, IssueStatusCategory.CANCELLED),   // ignorée
                openIssue(3L, 3, IssueStatusCategory.BACKLOG)));   // seule comptée

            SmartAssignResponse res = service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.LOW));

            assertThat(res.getRecommended().getOpenIssues()).isEqualTo(1);
            assertThat(res.getRecommended().getAvailability()).isEqualTo(100 - 3 * 4); // 3 pts × facteur 4
        }

        @Test
        @DisplayName("renvoie strategy=no-candidate quand aucun membre actif n'est éligible")
        void should_return_no_candidate_when_empty() {
            stubResolvedContext();
            stubWorkspaceMembers(); // aucun membre

            SmartAssignResponse res = service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM));

            assertThat(res.getRecommended()).isNull();
            assertThat(res.getAlternatives()).isEmpty();
            assertThat(res.getStrategy()).isEqualTo("no-candidate");
            assertThat(res.isFallbackUsed()).isTrue();
        }

        @Test
        @DisplayName("exclut les membres inactifs de la liste de candidats")
        void should_exclude_inactive_members() {
            User active = user(10L, "Active");
            User inactive = User.builder().id(11L).email("x@ex.dev").displayName("Ghost").isActive(false).build();
            stubResolvedContext();
            stubWorkspaceMembers(active, inactive);

            SmartAssignResponse res = service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM));

            assertThat(res.getRecommended().getUserId()).isEqualTo(10L);
            assertThat(res.getAlternatives()).isEmpty(); // l'inactif n'apparaît pas
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("repli sans Groq (fallback)")
    class Fallback {

        @Test
        @DisplayName("bascule en java-fallback si Groq échoue, tout en classant les candidats")
        void should_fallback_when_groq_throws() {
            User u = user(10L, "Alice");
            stubResolvedContext();
            stubWorkspaceMembers(u);
            when(groqService.chatCompletion(any(), any(), any(), anyBoolean()))
                .thenThrow(new RuntimeException("groq down"));

            SmartAssignResponse res = service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM));

            assertThat(res.isFallbackUsed()).isTrue();
            assertThat(res.getStrategy()).isEqualTo("java-fallback");
            assertThat(res.getRecommended()).isNotNull();
            assertThat(res.getRecommended().getUserId()).isEqualTo(10L);
            // pas de raison Groq → raison synthétisée côté Java (repli)
            assertThat(res.getRecommended().getReason()).isNotBlank();
        }

        @Test
        @DisplayName("un score sémantique Groq élevé fait remonter un candidat sans skill déclaré")
        void should_apply_groq_semantic_score() {
            User alice = user(10L, "Alice"); // skill match java
            User bob = user(11L, "Bob");     // pas de skill, mais Groq l'adore
            stubResolvedContext();
            stubWorkspaceMembers(alice, bob);
            stubSkills(10L, "java");
            when(groqService.chatCompletion(any(), any(), any(), anyBoolean()))
                .thenReturn("{\"scores\":[{\"candidate_id\":11,\"score\":0.99,\"reason\":\"great semantic fit\"}]}");

            SmartAssignResponse res = service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM, "java"));

            assertThat(res.isFallbackUsed()).isFalse();
            assertThat(res.getRecommended().getUserId()).isEqualTo(11L);
            assertThat(res.getRecommended().getSemanticScore()).isEqualTo(99);
            assertThat(res.getRecommended().getReason()).isEqualTo("great semantic fit");
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("montée en compétence (growth guards)")
    class Growth {

        private SmartAssignResponse previewGrowth(long userId, IssuePriority priority, int storyPoints, double usualComplexity) {
            User diego = user(userId, "Diego");
            stubWorkspaceMembers(diego);
            stubSkills(userId, "react"); // adjacence générique (mode projet, growth auto)
            // lenient : les garde-fous (URGENT / mode off) court-circuitent avant fetchUsualComplexity.
            lenient().doReturn(usualComplexity).when(jdbcTemplate)
                .queryForObject(contains("story_points"), eq(Double.class), eq(WS_ID), eq(userId));
            // preview() ne transmet pas les story points → on passe par rankForRedistribution (issue estimée).
            return service.rankForRedistribution(workspace, project,
                Issue.builder().id(99L).title("Stretch task").description("Learn").project(project)
                    .status(IssueStatus.builder().category(IssueStatusCategory.BACKLOG).build())
                    .priority(priority).storyPoints(storyPoints)
                    .labels(List.of(label("react"))).build());
        }

        @Test
        @DisplayName("ajoute le bonus stretch quand tous les garde-fous passent (mode projet)")
        void should_add_growth_bonus_when_guards_pass() {
            project.setGrowthMode(true);
            // usual=2 → stretch 4 ∈ [3,5] ; MEDIUM (pas urgent) ; dispo 100 ; skill react adjacent
            SmartAssignResponse res = previewGrowth(12L, IssuePriority.MEDIUM, 4, 2.0);

            assertThat(res.getRecommended().getFactors()).anyMatch(f -> f.contains("stretch"));
        }

        @Test
        @DisplayName("aucun bonus stretch sur une issue URGENTE (garde-fou)")
        void should_not_grow_on_urgent() {
            project.setGrowthMode(true);
            SmartAssignResponse res = previewGrowth(12L, IssuePriority.URGENT, 4, 2.0);

            assertThat(res.getRecommended().getFactors()).noneMatch(f -> f.contains("stretch"));
        }

        @Test
        @DisplayName("aucun bonus stretch si le mode montée en compétence est désactivé sur le projet")
        void should_not_grow_when_mode_off() {
            project.setGrowthMode(false); // défaut
            SmartAssignResponse res = previewGrowth(12L, IssuePriority.MEDIUM, 4, 2.0);

            assertThat(res.getRecommended().getFactors()).noneMatch(f -> f.contains("stretch"));
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("recommend — issue existante & persistance")
    class Recommend {

        private final long ISSUE_ID = 500L;

        private Issue existingIssue() {
            return Issue.builder().id(ISSUE_ID).title("Existing").description("desc").project(project)
                .status(IssueStatus.builder().category(IssueStatusCategory.BACKLOG).build())
                .priority(IssuePriority.MEDIUM).storyPoints(3).labels(List.of(label("java"))).build();
        }

        @Test
        @DisplayName("recommande et persiste un assignment_events pour le candidat retenu")
        void should_recommend_and_log_assignment_event() {
            User alice = user(10L, "Alice");
            stubResolvedContext();
            stubWorkspaceMembers(alice);
            stubSkills(10L, "java");
            when(issueRepository.findById(ISSUE_ID)).thenReturn(Optional.of(existingIssue()));

            SmartAssignResponse res = service.recommend(SLUG, PROJECT_ID, ISSUE_ID, REQUESTER);

            assertThat(res.getRecommended().getUserId()).isEqualTo(10L);
            // assignment_events inséré (5 args) + ai_runs inséré
            verify(jdbcTemplate).update(contains("assignment_events"), any(), any(), any(), any(), any());
            verify(jdbcTemplate).update(contains("ai_runs"), any(), any(), any(), any(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("lève ResourceNotFoundException si l'issue n'appartient pas au projet (IDOR)")
        void should_throw_when_issue_from_other_project() {
            stubResolvedContext();
            Project otherProject = Project.builder().id(77L).workspace(workspace).build();
            Issue foreign = Issue.builder().id(ISSUE_ID).project(otherProject)
                .status(IssueStatus.builder().category(IssueStatusCategory.BACKLOG).build()).build();
            when(issueRepository.findById(ISSUE_ID)).thenReturn(Optional.of(foreign));

            assertThatThrownBy(() -> service.recommend(SLUG, PROJECT_ID, ISSUE_ID, REQUESTER))
                .isInstanceOf(ResourceNotFoundException.class);
            verify(jdbcTemplate, never()).update(contains("assignment_events"), any(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("lève ResourceNotFoundException si le projet est hors du workspace (IDOR)")
        void should_throw_when_project_from_other_workspace() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
            when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS_ID, REQUESTER)).thenReturn(true);
            Workspace other = Workspace.builder().id(999L).slug("other").build();
            Project foreignProject = Project.builder().id(PROJECT_ID).workspace(other).build();
            when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(foreignProject));

            assertThatThrownBy(() -> service.recommend(SLUG, PROJECT_ID, ISSUE_ID, REQUESTER))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("autorisation & garde-fous d'entrée")
    class Authorization {

        @Test
        @DisplayName("lève ResourceNotFoundException si le workspace est introuvable")
        void should_throw_when_workspace_not_found() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM)))
                .isInstanceOf(ResourceNotFoundException.class);
            verify(projectRepository, never()).findById(anyLong());
        }

        @Test
        @DisplayName("refuse l'accès (ResourceNotFoundException) à un non-membre du workspace")
        void should_throw_when_requester_not_member() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
            when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS_ID, REQUESTER)).thenReturn(false);

            assertThatThrownBy(() -> service.preview(SLUG, PROJECT_ID, REQUESTER, previewRequest(IssuePriority.MEDIUM)))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Accès refusé");
            verify(projectRepository, never()).findById(anyLong());
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("bulkRecommend & rankForRedistribution")
    class BulkAndRedistribution {

        @Test
        @DisplayName("bulkRecommend traite les issues du projet et ignore celles d'un autre projet")
        void should_bulk_recommend_and_skip_foreign_issue() {
            User alice = user(10L, "Alice");
            stubResolvedContext();
            stubWorkspaceMembers(alice);
            Issue mine = Issue.builder().id(1L).title("Mine").project(project)
                .status(IssueStatus.builder().category(IssueStatusCategory.BACKLOG).build())
                .priority(IssuePriority.MEDIUM).storyPoints(3).labels(List.of(label("java"))).build();
            Project otherProject = Project.builder().id(77L).workspace(workspace).build();
            Issue foreign = Issue.builder().id(2L).title("Foreign").project(otherProject)
                .status(IssueStatus.builder().category(IssueStatusCategory.BACKLOG).build())
                .priority(IssuePriority.MEDIUM).labels(List.of()).build();
            when(issueRepository.findById(1L)).thenReturn(Optional.of(mine));
            when(issueRepository.findById(2L)).thenReturn(Optional.of(foreign));

            List<BulkSmartAssignItemResponse> res =
                service.bulkRecommend(SLUG, PROJECT_ID, REQUESTER, List.of(1L, 2L));

            assertThat(res).hasSize(1);
            assertThat(res.get(0).getIssueId()).isEqualTo(1L);
            assertThat(res.get(0).getRecommended().getUserId()).isEqualTo(10L);
        }

        @Test
        @DisplayName("bulkRecommend renvoie une liste vide pour une entrée vide")
        void should_return_empty_for_empty_ids() {
            stubResolvedContext();

            List<BulkSmartAssignItemResponse> res =
                service.bulkRecommend(SLUG, PROJECT_ID, REQUESTER, List.of());

            assertThat(res).isEmpty();
            verify(workspaceMemberRepository, never()).findByWorkspaceId(anyLong());
        }

        @Test
        @DisplayName("rankForRedistribution classe les candidats sans persister d'assignment_events")
        void should_rank_without_logging_assignment_event() {
            User alice = user(10L, "Alice");
            stubWorkspaceMembers(alice);
            stubSkills(10L, "java");
            Issue issue = Issue.builder().id(9L).title("Redistrib").project(project)
                .status(IssueStatus.builder().category(IssueStatusCategory.BACKLOG).build())
                .priority(IssuePriority.MEDIUM).storyPoints(3).labels(List.of(label("java"))).build();

            SmartAssignResponse res = service.rankForRedistribution(workspace, project, issue);

            assertThat(res.getRecommended().getUserId()).isEqualTo(10L);
            // preview de redistribution : ai_runs tracé, mais PAS d'assignment_events
            verify(jdbcTemplate, never()).update(contains("assignment_events"), any(), any(), any(), any(), any());
        }
    }
}
