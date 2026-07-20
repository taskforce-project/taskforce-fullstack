package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.taskforce.tf_api.core.dto.request.AddIssueToCycleRequest;
import com.taskforce.tf_api.core.dto.request.CreateCycleRequest;
import com.taskforce.tf_api.core.dto.request.UpdateCycleRequest;
import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Cycle;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.CycleIssueRepository;
import com.taskforce.tf_api.core.repository.CycleRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration (B-T7) — {@link CycleService} contre un vrai Postgres.
 * Service chargé via {@code @Import} ; {@code IssueService} en {@code @MockitoBean}, repos réels.
 * Couvre CRUD cycle (création + statut par défaut, nom unique, update de statut + statut invalide,
 * introuvable) et la relation cycle↔issue (ajout, doublon, IDOR issue hors projet).
 */
@DisplayName("CycleService (intégration Postgres)")
// ProjectVisibilityGuard : dépendance de CycleService depuis l'ajout de listWorkspaceCycles
// (périmètre = projets visibles). C'est un @Component sur repos JPA, donc chargeable dans la tranche.
@Import({CycleService.class, ProjectVisibilityGuard.class})
class CycleServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private CycleService cycleService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private CycleRepository cycleRepository;
    @Autowired private CycleIssueRepository cycleIssueRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    private IssueService issueService;

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    private SlackIntegrationService slackService;

    private static final String SLUG = "ws-cycle-it";

    private User owner;
    private Project project;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-cyc").email("cyc@it.dev").displayName("Owner").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("Cycle WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws).user(owner).role(WorkspaceRole.OWNER).build());
        project = projectRepository.save(Project.builder()
            .workspace(ws).name("App").identifier("APP").createdBy(owner).build());
    }

    private CreateCycleRequest req(String name) {
        CreateCycleRequest r = new CreateCycleRequest();
        r.setName(name);
        r.setDescription("desc");
        return r;
    }

    private Long projectId() {
        return project.getId();
    }

    private Issue persistIssue(Project p, String title) {
        IssueStatus status = issueStatusRepository.save(IssueStatus.builder()
            .project(p).name("Backlog").category(IssueStatusCategory.BACKLOG).build());
        return issueRepository.save(Issue.builder()
            .project(p).status(status).reporter(owner).sequenceNumber(1).title(title).build());
    }

    // =========================================================================
    @Nested
    @DisplayName("CRUD cycle")
    class Crud {

        @Test
        @DisplayName("crée un cycle au statut DRAFT")
        void should_create_cycle_draft() {
            CycleResponse res = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            assertThat(res.getName()).isEqualTo("Sprint 1");
            assertThat(res.getStatus()).isEqualTo(CycleStatus.DRAFT);

            Cycle persisted = cycleRepository.findById(res.getId()).orElseThrow();
            assertThat(persisted.getStatus()).isEqualTo(CycleStatus.DRAFT);
        }

        @Test
        @DisplayName("refuse un nom de cycle déjà pris dans le projet")
        void should_reject_duplicate_name() {
            cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            assertThatThrownBy(() -> cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId()))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("getCycle lève ResourceNotFoundException pour un id inconnu")
        void should_throw_when_cycle_unknown() {
            assertThatThrownBy(() -> cycleService.getCycle(SLUG, projectId(), 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("met à jour le statut du cycle (DRAFT → ACTIVE)")
        void should_update_status() {
            CycleResponse created = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            UpdateCycleRequest upd = new UpdateCycleRequest();
            upd.setStatus("ACTIVE");
            CycleResponse res = cycleService.updateCycle(SLUG, projectId(), created.getId(), upd, owner.getId());

            assertThat(res.getStatus()).isEqualTo(CycleStatus.ACTIVE);
            assertThat(cycleRepository.findById(created.getId()).orElseThrow().getStatus())
                .isEqualTo(CycleStatus.ACTIVE);
        }

        @Test
        @DisplayName("transition vers COMPLETED déclenche le push Slack cycle.completed")
        void completing_cycle_triggers_slack_push() {
            CycleResponse created = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            UpdateCycleRequest upd = new UpdateCycleRequest();
            upd.setStatus("COMPLETED");

            cycleService.updateCycle(SLUG, projectId(), created.getId(), upd, owner.getId());

            org.mockito.Mockito.verify(slackService).notifyEvent(
                org.mockito.ArgumentMatchers.eq(project.getWorkspace().getId()),
                org.mockito.ArgumentMatchers.eq("cycle.completed"),
                org.mockito.ArgumentMatchers.anyString());
        }

        @Test
        @DisplayName("rejette un statut de cycle invalide")
        void should_reject_invalid_status() {
            CycleResponse created = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            UpdateCycleRequest upd = new UpdateCycleRequest();
            upd.setStatus("BOGUS");

            assertThatThrownBy(() -> cycleService.updateCycle(SLUG, projectId(), created.getId(), upd, owner.getId()))
                .isInstanceOf(BusinessException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("issues d'un cycle")
    class CycleIssues {

        @Test
        @DisplayName("ajoute une issue au cycle puis refuse le doublon")
        void should_add_issue_then_reject_duplicate() {
            CycleResponse cycle = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            Issue issue = persistIssue(project, "Task 1");

            AddIssueToCycleRequest add = new AddIssueToCycleRequest();
            add.setIssueId(issue.getId());
            cycleService.addIssueToCycle(SLUG, projectId(), cycle.getId(), add, owner.getId());

            assertThat(cycleIssueRepository.countByCycleId(cycle.getId())).isEqualTo(1);

            assertThatThrownBy(() -> cycleService.addIssueToCycle(SLUG, projectId(), cycle.getId(), add, owner.getId()))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("refuse d'ajouter une issue d'un autre projet (IDOR)")
        void should_reject_issue_from_other_project() {
            CycleResponse cycle = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            Project other = projectRepository.save(Project.builder()
                .workspace(project.getWorkspace()).name("Other").identifier("OTH").createdBy(owner).build());
            Issue foreign = persistIssue(other, "Foreign");

            AddIssueToCycleRequest add = new AddIssueToCycleRequest();
            add.setIssueId(foreign.getId());

            assertThatThrownBy(() -> cycleService.addIssueToCycle(SLUG, projectId(), cycle.getId(), add, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("listCycleIssues renvoie les issues du cycle")
        void should_list_cycle_issues() {
            CycleResponse cycle = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            Issue issue = persistIssue(project, "Task 1");
            AddIssueToCycleRequest add = new AddIssueToCycleRequest();
            add.setIssueId(issue.getId());
            cycleService.addIssueToCycle(SLUG, projectId(), cycle.getId(), add, owner.getId());

            assertThat(cycleService.listCycleIssues(SLUG, projectId(), cycle.getId(), owner.getId())).hasSize(1);
        }

        @Test
        @DisplayName("removeIssueFromCycle retire l'issue du cycle")
        void should_remove_issue_from_cycle() {
            CycleResponse cycle = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            Issue issue = persistIssue(project, "Task 1");
            AddIssueToCycleRequest add = new AddIssueToCycleRequest();
            add.setIssueId(issue.getId());
            cycleService.addIssueToCycle(SLUG, projectId(), cycle.getId(), add, owner.getId());
            assertThat(cycleIssueRepository.countByCycleId(cycle.getId())).isEqualTo(1);

            cycleService.removeIssueFromCycle(SLUG, projectId(), cycle.getId(), issue.getId(), owner.getId());

            assertThat(cycleIssueRepository.countByCycleId(cycle.getId())).isZero();
        }

        @Test
        @DisplayName("removeIssueFromCycle lève ResourceNotFoundException si l'issue n'est pas dans le cycle")
        void should_throw_when_removing_absent_issue() {
            CycleResponse cycle = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            Issue issue = persistIssue(project, "Absent");

            assertThatThrownBy(() ->
                cycleService.removeIssueFromCycle(SLUG, projectId(), cycle.getId(), issue.getId(), owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("addIssueToCycle lève ResourceNotFoundException pour une issue inexistante")
        void should_throw_when_issue_unknown() {
            CycleResponse cycle = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            AddIssueToCycleRequest add = new AddIssueToCycleRequest();
            add.setIssueId(999_999L);

            assertThatThrownBy(() -> cycleService.addIssueToCycle(SLUG, projectId(), cycle.getId(), add, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("CRUD cycle — branches additionnelles")
    class CrudAdditional {

        @Test
        @DisplayName("listCycles renvoie les cycles du projet")
        void should_list_cycles() {
            cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            cycleService.createCycle(SLUG, projectId(), req("Sprint 2"), owner.getId());

            assertThat(cycleService.listCycles(SLUG, projectId(), owner.getId())).hasSize(2);
        }

        @Test
        @DisplayName("getCycle renvoie le cycle demandé")
        void should_get_cycle() {
            CycleResponse created = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            CycleResponse res = cycleService.getCycle(SLUG, projectId(), created.getId(), owner.getId());

            assertThat(res.getId()).isEqualTo(created.getId());
            assertThat(res.getName()).isEqualTo("Sprint 1");
            assertThat(res.getIssueCount()).isZero();
        }

        @Test
        @DisplayName("updateCycle met à jour nom, description et dates")
        void should_update_fields() {
            CycleResponse created = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            UpdateCycleRequest upd = new UpdateCycleRequest();
            upd.setName("Sprint renommé");
            upd.setDescription("nouvelle desc");
            upd.setStartDate(java.time.LocalDate.of(2026, 1, 1));
            upd.setEndDate(java.time.LocalDate.of(2026, 1, 15));

            CycleResponse res = cycleService.updateCycle(SLUG, projectId(), created.getId(), upd, owner.getId());

            assertThat(res.getName()).isEqualTo("Sprint renommé");
            assertThat(res.getDescription()).isEqualTo("nouvelle desc");
            assertThat(res.getStartDate()).isEqualTo(java.time.LocalDate.of(2026, 1, 1));
            assertThat(res.getEndDate()).isEqualTo(java.time.LocalDate.of(2026, 1, 15));
        }

        @Test
        @DisplayName("updateCycle refuse un nom déjà pris par un autre cycle")
        void should_reject_duplicate_name_on_update() {
            cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());
            CycleResponse second = cycleService.createCycle(SLUG, projectId(), req("Sprint 2"), owner.getId());

            UpdateCycleRequest upd = new UpdateCycleRequest();
            upd.setName("Sprint 1");

            assertThatThrownBy(() -> cycleService.updateCycle(SLUG, projectId(), second.getId(), upd, owner.getId()))
                .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("updateCycle tolère le même nom (pas de conflit avec soi-même)")
        void should_allow_same_name_on_update() {
            CycleResponse created = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            UpdateCycleRequest upd = new UpdateCycleRequest();
            upd.setName("Sprint 1");
            upd.setDescription("maj");

            CycleResponse res = cycleService.updateCycle(SLUG, projectId(), created.getId(), upd, owner.getId());

            assertThat(res.getName()).isEqualTo("Sprint 1");
            assertThat(res.getDescription()).isEqualTo("maj");
        }

        @Test
        @DisplayName("deleteCycle supprime le cycle")
        void should_delete_cycle() {
            CycleResponse created = cycleService.createCycle(SLUG, projectId(), req("Sprint 1"), owner.getId());

            cycleService.deleteCycle(SLUG, projectId(), created.getId(), owner.getId());

            assertThat(cycleRepository.findById(created.getId())).isEmpty();
        }

        @Test
        @DisplayName("deleteCycle lève ResourceNotFoundException pour un cycle inconnu")
        void should_throw_when_deleting_unknown_cycle() {
            assertThatThrownBy(() -> cycleService.deleteCycle(SLUG, projectId(), 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("resolveProject lève ResourceNotFoundException pour un projet inconnu")
        void should_throw_when_project_unknown() {
            assertThatThrownBy(() -> cycleService.listCycles(SLUG, 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("refuse l'accès à un non-membre du workspace (IDOR)")
        void should_reject_non_member() {
            User intruder = userRepository.save(User.builder()
                .keycloakId("kc-intruder").email("intruder@it.dev").displayName("Intruder").isActive(true).build());

            assertThatThrownBy(() -> cycleService.listCycles(SLUG, projectId(), intruder.getId()))
                .isInstanceOf(BusinessException.class);
        }
    }
}
