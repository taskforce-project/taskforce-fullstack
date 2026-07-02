package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AnalyticsKpisResponse;
import com.taskforce.tf_api.core.dto.response.ThroughputPointResponse;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

/**
 * Tests d'intégration (B-T7) — {@link AnalyticsService} contre un vrai Postgres.
 *
 * <p>Service chargé via {@code @Import} ; repos + {@code JdbcTemplate} réels ; les collaborateurs
 * non-DB sont mockés ({@code AuthorizationService} → membre OK, {@code PlanFeatureService} → gating,
 * {@code GroqService}/{@code ObjectMapper} inutilisés ici). Valide le calcul KPIs (SQL réel de
 * {@code countCompletedBetween}), la structure du throughput (8 buckets semaine) et l'<b>enforcement
 * du gating PRO</b> sur les analytics avancées.</p>
 */
@DisplayName("AnalyticsService (intégration Postgres)")
@Import(AnalyticsService.class)
class AnalyticsServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private AnalyticsService analyticsService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;

    @MockitoBean private AuthorizationService authorizationService;   // requireMember → no-op (membre OK)
    @MockitoBean private PlanFeatureService planFeatureService;        // gating PRO
    @MockitoBean private GroqService groqService;                      // inutilisé (pas d'insights ici)
    @MockitoBean private ObjectMapper objectMapper;                   // inutilisé (pas de parsing ici)

    private static final String SLUG = "ws-an-it";

    private User owner;
    private Project project;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-an").email("an@it.dev").displayName("Owner").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("An WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws).user(owner).role(WorkspaceRole.OWNER).build());
        project = projectRepository.save(Project.builder()
            .workspace(ws).name("App").identifier("APP").createdBy(owner).build());
    }

    private void persistIssue(String title, LocalDateTime completedAt) {
        IssueStatus status = issueStatusRepository.save(IssueStatus.builder()
            .project(project).name("S").category(IssueStatusCategory.COMPLETED).build());
        issueRepository.save(Issue.builder()
            .project(project).status(status).reporter(owner).sequenceNumber(1).title(title)
            .completedAt(completedAt).build());
    }

    @Test
    @DisplayName("getKpis sans issue résolue → tout à zéro")
    void kpis_empty_returns_zeros() {
        AnalyticsKpisResponse kpis = analyticsService.getKpis(SLUG, owner.getId(), null);

        assertThat(kpis.tasksResolved()).isZero();
        assertThat(kpis.velocity()).isZero();
        assertThat(kpis.activeCycles()).isZero();
    }

    @Test
    @DisplayName("getKpis compte une issue complétée ce mois-ci (SQL réel countCompletedBetween)")
    void kpis_counts_completed_this_month() {
        persistIssue("done", LocalDateTime.now().minusMinutes(1)); // dans [début de mois, maintenant)

        AnalyticsKpisResponse kpis = analyticsService.getKpis(SLUG, owner.getId(), null);

        assertThat(kpis.tasksResolved()).isGreaterThanOrEqualTo(1);
    }

    @Test
    @DisplayName("getThroughput (WEEK) renvoie 8 buckets glissants")
    void throughput_returns_8_weekly_buckets() {
        List<ThroughputPointResponse> points = analyticsService.getThroughput(SLUG, owner.getId(), null, "WEEK");

        assertThat(points).hasSize(8);
    }

    @Test
    @DisplayName("getThroughput applique le gating PRO (PlanFeatureService refuse → propagé)")
    void throughput_enforces_plan_gating() {
        doThrow(new BusinessException("Fonctionnalité réservée au plan Pro"))
            .when(planFeatureService).requireFeature(any(), any());

        assertThatThrownBy(() -> analyticsService.getThroughput(SLUG, owner.getId(), null, "WEEK"))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("getCapacity renvoie une ligne par membre (owner)")
    void capacity_returns_member_rows() {
        var capacity = analyticsService.getCapacity(SLUG, owner.getId(), null);
        assertThat(capacity).hasSize(1); // seul l'owner est membre
    }

    @Test
    @DisplayName("getBurndown sans cycle actif → liste vide")
    void burndown_empty_without_active_cycle() {
        assertThat(analyticsService.getBurndown(SLUG, owner.getId(), null)).isEmpty();
    }

    @Test
    @DisplayName("getWorkload renvoie une réponse non nulle")
    void workload_not_null() {
        assertThat(analyticsService.getWorkload(SLUG, owner.getId(), 7)).isNotNull();
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.taskforce.tf_api.core.repository.CycleRepository cycleRepository;

    @Test
    @DisplayName("getBurndown avec un cycle ACTIF renvoie des points (parcourt les jours)")
    void burndown_with_active_cycle() {
        cycleRepository.save(com.taskforce.tf_api.core.model.Cycle.builder()
            .project(project)
            .name("Sprint actif")
            .status(com.taskforce.tf_api.core.enums.CycleStatus.ACTIVE)
            .startDate(java.time.LocalDate.now().minusDays(3))
            .endDate(java.time.LocalDate.now().plusDays(3))
            .createdBy(owner)
            .build());

        assertThat(analyticsService.getBurndown(SLUG, owner.getId(), null)).isNotEmpty();
    }

    @Test
    @DisplayName("getWorkload agrège une issue ouverte assignée avec échéance proche")
    void workload_with_due_issue() {
        var status = issueStatusRepository.save(com.taskforce.tf_api.core.model.IssueStatus.builder()
            .project(project).name("Todo").category(IssueStatusCategory.UNSTARTED).build());
        issueRepository.save(com.taskforce.tf_api.core.model.Issue.builder()
            .project(project).status(status).reporter(owner).assignee(owner)
            .sequenceNumber(1).title("Due bientôt")
            .dueDate(java.time.LocalDate.now().plusDays(2))
            .build());

        assertThat(analyticsService.getWorkload(SLUG, owner.getId(), 7)).isNotNull();
    }

    @Test
    @DisplayName("getCapacity agrège les issues ouvertes par membre")
    void capacity_with_open_issue() {
        var status = issueStatusRepository.save(com.taskforce.tf_api.core.model.IssueStatus.builder()
            .project(project).name("Todo").category(IssueStatusCategory.UNSTARTED).build());
        issueRepository.save(com.taskforce.tf_api.core.model.Issue.builder()
            .project(project).status(status).reporter(owner).assignee(owner)
            .sequenceNumber(1).title("Ouverte").build());

        assertThat(analyticsService.getCapacity(SLUG, owner.getId(), null)).hasSize(1);
    }

    @Test
    @DisplayName("getKpis avec des issues complétées calcule résolutions, moyenne, vélocité")
    void kpis_with_completed_data() {
        // 3 complétées récemment (ce mois + cette semaine), séquences distinctes
        var status = issueStatusRepository.save(com.taskforce.tf_api.core.model.IssueStatus.builder()
            .project(project).name("Done").category(IssueStatusCategory.COMPLETED).build());
        LocalDateTime[] when = { LocalDateTime.now().minusMinutes(1), LocalDateTime.now().minusHours(2), LocalDateTime.now().minusDays(1) };
        for (int i = 0; i < when.length; i++) {
            issueRepository.save(com.taskforce.tf_api.core.model.Issue.builder()
                .project(project).status(status).reporter(owner).assignee(owner)
                .sequenceNumber(i + 1).title("d" + i).completedAt(when[i]).build());
        }

        var kpis = analyticsService.getKpis(SLUG, owner.getId(), null);

        assertThat(kpis.tasksResolved()).isGreaterThanOrEqualTo(3);
        assertThat(kpis.velocity()).isGreaterThanOrEqualTo(3);
        // getThroughput DAY exerce les buckets avec données
        assertThat(analyticsService.getThroughput(SLUG, owner.getId(), null, "DAY")).hasSize(30);
    }

    @Test
    @DisplayName("generateInsights sans plan PRO renvoie l'invite d'upgrade (non vide)")
    void insights_upgrade_when_not_pro() {
        // planFeatureService.has(...) → false par défaut (mock) → upgradeInsights()
        var insights = analyticsService.generateInsights(SLUG, owner.getId());
        assertThat(insights).isNotEmpty();
    }

    @Test
    @DisplayName("generateInsights (PRO) parse le JSON Groq en 3 insights")
    void insights_parsed_from_groq_json() throws Exception {
        org.mockito.Mockito.when(planFeatureService.has(any(), any())).thenReturn(true);
        String json = "{\"insights\":["
            + "{\"agent\":\"COO\",\"agentColor\":\"#0a84ff\",\"category\":\"Operations\",\"urgency\":\"high\",\"confidence\":88,\"action\":\"Ajuster le scope\",\"insight\":\"Trop d'issues ouvertes\"},"
            + "{\"agent\":\"CPO\",\"category\":\"Product\",\"urgency\":\"medium\",\"confidence\":40,\"action\":\"Prioriser\",\"insight\":\"Backlog large\"},"
            + "{\"agent\":\"CTO\",\"category\":\"Engineering\",\"urgency\":\"low\",\"confidence\":99,\"action\":\"Revue\",\"insight\":\"Vélocité stable\"}"
            + "]}";
        org.mockito.Mockito.when(groqService.chatCompletion(any(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
            .thenReturn(json);
        // le mock ObjectMapper délègue à un vrai parseur pour readTree
        org.mockito.Mockito.when(objectMapper.readTree(org.mockito.ArgumentMatchers.anyString()))
            .thenAnswer(i -> new ObjectMapper().readTree((String) i.getArgument(0)));

        var insights = analyticsService.generateInsights(SLUG, owner.getId());

        assertThat(insights).hasSize(3);
        // confidence borné dans [50,95]
        assertThat(insights.get(1).getConfidence()).isEqualTo(50);
        assertThat(insights.get(2).getConfidence()).isEqualTo(95);
    }

    @Test
    @DisplayName("generateInsights (PRO) retombe sur le fallback si le JSON n'a pas d'insights")
    void insights_fallback_on_empty_json() throws Exception {
        org.mockito.Mockito.when(planFeatureService.has(any(), any())).thenReturn(true);
        org.mockito.Mockito.when(groqService.chatCompletion(any(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
            .thenReturn("{}");
        org.mockito.Mockito.when(objectMapper.readTree(org.mockito.ArgumentMatchers.anyString()))
            .thenAnswer(i -> new ObjectMapper().readTree((String) i.getArgument(0)));

        var insights = analyticsService.generateInsights(SLUG, owner.getId());

        assertThat(insights).hasSize(1); // fallbackInsights
    }
}
