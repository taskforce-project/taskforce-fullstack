package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.ProjectObjectiveRequest;
import com.taskforce.tf_api.core.dto.response.ProjectObjectiveResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.ProjectObjective;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectObjectiveRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * L'objectif d'un projet (la vue du workflow, lot W1) : posé, relu, retiré, le texte pris sans ses espaces, et des droits
 * dans l'ordre du reste du projet. La garde de visibilité est la vraie, sur des repositories simulés : la règle des rôles
 * est celle qui tourne, pas un bouchon.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProjectObjectiveService")
class ProjectObjectiveServiceTest {

    private static final String SLUG = "acme";
    private static final long WS = 3L;
    private static final long PROJECT = 12L;

    // Les personnes : la responsable du projet, un membre du projet, une lectrice du projet, un administrateur et la
    // propriétaire de l'espace (hors du projet), un membre de l'espace hors du projet, et quelqu'un d'un autre espace.
    private static final long LEAD = 7L;
    private static final long MEMBER = 8L;
    private static final long VIEWER = 11L;
    private static final long ADMIN = 5L;
    private static final long OWNER = 4L;
    private static final long WS_MEMBER = 10L;
    private static final long OUTSIDER = 9L;

    @Mock private ProjectObjectiveRepository objectiveRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private ProjectMemberRepository projectMemberRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private UserRepository userRepository;
    @Mock private AuditService audit;

    private ProjectObjectiveService service;
    private Workspace workspace;
    private Project project;
    private User ada;

    @BeforeEach
    void setUp() {
        ProjectVisibilityGuard guard = new ProjectVisibilityGuard(projectMemberRepository, workspaceMemberRepository, projectRepository);
        service = new ProjectObjectiveService(objectiveRepository, projectRepository, projectMemberRepository, workspaceRepository,
            workspaceMemberRepository, userRepository, guard, audit);

        ada = User.builder().id(LEAD).email("ada@example.com").displayName("Ada").build();
        workspace = Workspace.builder().id(WS).slug(SLUG).build();
        project = Project.builder().id(PROJECT).workspace(workspace).name("Website").identifier("WEB").isPublic(false).build();

        lenient().when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
        lenient().when(projectRepository.findByIdAndWorkspaceId(PROJECT, WS)).thenReturn(Optional.of(project));
        lenient().when(projectRepository.findByIdAndWorkspaceId(eq(99L), anyLong())).thenReturn(Optional.empty());
        workspaceRole(LEAD, WorkspaceRole.MEMBER);
        workspaceRole(MEMBER, WorkspaceRole.MEMBER);
        workspaceRole(VIEWER, WorkspaceRole.MEMBER);
        workspaceRole(ADMIN, WorkspaceRole.ADMIN);
        workspaceRole(OWNER, WorkspaceRole.OWNER);
        workspaceRole(WS_MEMBER, WorkspaceRole.MEMBER);
        lenient().when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS, OUTSIDER)).thenReturn(false);
        lenient().when(workspaceMemberRepository.findByWorkspaceIdAndUserId(WS, OUTSIDER)).thenReturn(Optional.empty());
        projectRole(LEAD, ProjectRole.LEAD);
        projectRole(MEMBER, ProjectRole.MEMBER);
        projectRole(VIEWER, ProjectRole.VIEWER);
        for (long none : new long[] {ADMIN, OWNER, WS_MEMBER, OUTSIDER}) {
            lenient().when(projectMemberRepository.existsByProjectIdAndUserId(PROJECT, none)).thenReturn(false);
            lenient().when(projectMemberRepository.findByProjectIdAndUserId(PROJECT, none)).thenReturn(Optional.empty());
        }
        lenient().when(objectiveRepository.findById(PROJECT)).thenReturn(Optional.empty());
        lenient().when(objectiveRepository.save(any(ProjectObjective.class))).thenAnswer(saved -> saved.getArgument(0));
        lenient().when(userRepository.findById(anyLong()))
            .thenAnswer(inv -> Optional.of(User.builder().id(inv.getArgument(0)).email("someone@example.com").build()));
        lenient().when(userRepository.findById(LEAD)).thenReturn(Optional.of(ada));
    }

    private void workspaceRole(long userId, WorkspaceRole role) {
        WorkspaceMember member = WorkspaceMember.builder().workspace(workspace).user(User.builder().id(userId).build()).role(role).build();
        lenient().when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS, userId)).thenReturn(true);
        lenient().when(workspaceMemberRepository.findByWorkspaceIdAndUserId(WS, userId)).thenReturn(Optional.of(member));
    }

    private void projectRole(long userId, ProjectRole role) {
        ProjectMember member = ProjectMember.builder().project(project).user(User.builder().id(userId).build()).role(role).build();
        lenient().when(projectMemberRepository.existsByProjectIdAndUserId(PROJECT, userId)).thenReturn(true);
        lenient().when(projectMemberRepository.findByProjectIdAndUserId(PROJECT, userId)).thenReturn(Optional.of(member));
    }

    private static ProjectObjectiveRequest request(String goal, LocalDate targetDate, String... criteria) {
        return new ProjectObjectiveRequest(goal, targetDate, List.of(criteria));
    }

    private ProjectObjective stored() {
        ProjectObjective objective = ProjectObjective.builder().projectId(PROJECT).goal("Ship the beta")
            .targetDate(LocalDate.of(2026, 12, 31)).criteria(List.of("Ten teams use it", "No open P1 bug")).updatedBy(ada)
            .updatedAt(LocalDateTime.of(2026, 11, 14, 9, 30)).build();
        when(objectiveRepository.findById(PROJECT)).thenReturn(Optional.of(objective));
        return objective;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static ArgumentCaptor<Map<String, Object>> details() {
        return (ArgumentCaptor) ArgumentCaptor.forClass(Map.class);
    }

    // --------------------------------------------------------------------- poser, relire, retirer

    @Test
    @DisplayName("un projet sans objectif rend l'objectif vide, avec ce que l'appelant peut faire")
    void a_project_without_objective_reads_empty() {
        ProjectObjectiveResponse read = service.get(SLUG, PROJECT, LEAD);

        assertThat(read.goal()).isNull();
        assertThat(read.targetDate()).isNull();
        assertThat(read.criteria()).isEmpty();
        assertThat(read.updatedBy()).isNull();
        assertThat(read.updatedAt()).isNull();
        assertThat(read.canEdit()).isTrue();
    }

    @Test
    @DisplayName("posé, l'objectif se garde sans les espaces autour du texte, puis se relit tel quel")
    void sets_and_reads_back() {
        ProjectObjectiveResponse saved = service.set(SLUG, PROJECT, LEAD,
            request("  Ship the beta to ten teams  ", LocalDate.of(2026, 12, 31), "  Ten teams use it weekly ", "No open P1 bug"));

        ArgumentCaptor<ProjectObjective> row = ArgumentCaptor.forClass(ProjectObjective.class);
        verify(objectiveRepository).save(row.capture());
        assertThat(row.getValue().getProjectId()).isEqualTo(PROJECT);
        assertThat(row.getValue().getGoal()).isEqualTo("Ship the beta to ten teams");
        assertThat(row.getValue().getCriteria()).containsExactly("Ten teams use it weekly", "No open P1 bug");
        assertThat(row.getValue().getUpdatedBy()).isEqualTo(ada);
        assertThat(row.getValue().getUpdatedAt()).isNotNull();
        assertThat(saved.goal()).isEqualTo("Ship the beta to ten teams");
        assertThat(saved.targetDate()).isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(saved.criteria()).containsExactly("Ten teams use it weekly", "No open P1 bug");
        assertThat(saved.updatedBy()).isEqualTo("Ada");
        assertThat(saved.canEdit()).isTrue();

        when(objectiveRepository.findById(PROJECT)).thenReturn(Optional.of(row.getValue()));
        ProjectObjectiveResponse read = service.get(SLUG, PROJECT, MEMBER);

        assertThat(read.goal()).isEqualTo("Ship the beta to ten teams");
        assertThat(read.targetDate()).isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(read.criteria()).containsExactly("Ten teams use it weekly", "No open P1 bug");
        assertThat(read.updatedBy()).isEqualTo("Ada");
        assertThat(read.updatedAt()).isEqualTo(row.getValue().getUpdatedAt());
        assertThat(read.canEdit()).isFalse();
    }

    @Test
    @DisplayName("poser de nouveau remplace l'objectif en entier, sur la même ligne ; sans date, il n'en a plus")
    void setting_again_replaces_the_whole_objective() {
        ProjectObjective existing = stored();

        ProjectObjectiveResponse saved = service.set(SLUG, PROJECT, ADMIN, request("Open the beta", null, "Five teams use it"));

        verify(objectiveRepository).save(existing);
        assertThat(existing.getGoal()).isEqualTo("Open the beta");
        assertThat(existing.getTargetDate()).isNull();
        assertThat(existing.getCriteria()).containsExactly("Five teams use it");
        assertThat(saved.updatedBy()).isEqualTo("someone@example.com"); // sans nom affiché : l'adresse
    }

    @Test
    @DisplayName("retiré, l'objectif disparaît et la réponse est l'objectif vide")
    void clears() {
        ProjectObjective existing = stored();

        ProjectObjectiveResponse cleared = service.clear(SLUG, PROJECT, LEAD);

        verify(objectiveRepository).delete(existing);
        assertThat(cleared.goal()).isNull();
        assertThat(cleared.criteria()).isEmpty();
        assertThat(cleared.targetDate()).isNull();
        assertThat(cleared.updatedBy()).isNull();
        assertThat(cleared.canEdit()).isTrue();
    }

    @Test
    @DisplayName("retirer un objectif qui n'existe pas ne change rien et n'entre pas au journal")
    void clearing_nothing_changes_nothing() {
        ProjectObjectiveResponse cleared = service.clear(SLUG, PROJECT, LEAD);

        assertThat(cleared.goal()).isNull();
        verify(objectiveRepository, never()).delete(any());
        verifyNoInteractions(audit);
    }

    // --------------------------------------------------------------------- le texte

    @ParameterizedTest(name = "but « {0} », critères « {1} » : refusé")
    @CsvSource(delimiter = '|', value = {
        "'   '        | Ten teams use it",
        "Ship it      | '   '",
        "Ship it      | ''",
    })
    @DisplayName("un but ou un critère vide une fois les espaces retirés est refusé, et rien ne s'écrit")
    void blank_text_is_refused(String goal, String criterion) {
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, LEAD, request(goal, null, "Fine", criterion)))
            .isInstanceOf(BusinessException.class);

        verify(objectiveRepository, never()).save(any());
        verifyNoInteractions(audit);
    }

    @Test
    @DisplayName("hors du contrôleur aussi : six critères, aucun, ou un texte trop long sont refusés")
    void the_service_keeps_its_bounds() {
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, LEAD, request("Ship it", null, "1", "2", "3", "4", "5", "6")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("one to five");
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, LEAD, new ProjectObjectiveRequest("Ship it", null, List.of())))
            .isInstanceOf(BusinessException.class).hasMessageContaining("one to five");
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, LEAD, request("x".repeat(281), null, "Fine")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("280");
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, LEAD, request("Ship it", null, "y".repeat(201))))
            .isInstanceOf(BusinessException.class).hasMessageContaining("200");

        verify(objectiveRepository, never()).save(any());
    }

    @Test
    @DisplayName("la date visée tombe entre 2000 et 2100 : +9999999-01-01 et 1999-12-31 sont refusées, 2100-12-31 passe")
    void the_target_date_is_bounded() {
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, LEAD, request("Ship it", LocalDate.of(9_999_999, 1, 1), "Fine")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("between 2000 and 2100");
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, LEAD, request("Ship it", LocalDate.of(1999, 12, 31), "Fine")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("between 2000 and 2100");
        verify(objectiveRepository, never()).save(any());

        assertThat(service.set(SLUG, PROJECT, LEAD, request("Ship it", LocalDate.of(2100, 12, 31), "Fine")).targetDate())
            .isEqualTo(LocalDate.of(2100, 12, 31));
    }

    // --------------------------------------------------------------------- les droits, dans l'ordre du projet

    @Test
    @DisplayName("1. quelqu'un qui n'est pas membre de l'espace est refusé, comme ailleurs dans le projet")
    void a_non_member_of_the_workspace_is_refused() {
        assertThatThrownBy(() -> service.get(SLUG, PROJECT, OUTSIDER))
            .isInstanceOf(BusinessException.class).hasMessageContaining("not a member of this workspace");
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, OUTSIDER, request("Ship it", null, "Fine")))
            .isInstanceOf(BusinessException.class).hasMessageContaining("not a member of this workspace");
        assertThatThrownBy(() -> service.clear(SLUG, PROJECT, OUTSIDER))
            .isInstanceOf(BusinessException.class).hasMessageContaining("not a member of this workspace");

        verify(objectiveRepository, never()).findById(any());
    }

    @Test
    @DisplayName("2. un projet privé que l'appelant ne voit pas, ou un projet d'un autre espace, répond 404")
    void a_project_out_of_sight_is_not_found() {
        assertThatThrownBy(() -> service.get(SLUG, PROJECT, WS_MEMBER)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, WS_MEMBER, request("Ship it", null, "Fine")))
            .isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.clear(SLUG, PROJECT, WS_MEMBER)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.get(SLUG, 99L, LEAD)).isInstanceOf(ResourceNotFoundException.class);
        when(workspaceRepository.findBySlug("nowhere")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.get("nowhere", PROJECT, LEAD)).isInstanceOf(ResourceNotFoundException.class);

        verify(objectiveRepository, never()).findById(any());
        verify(objectiveRepository, never()).save(any());
    }

    @ParameterizedTest(name = "membre du projet {0} : 403")
    @CsvSource({"MEMBER", "VIEWER"})
    @DisplayName("3. un membre du projet qui n'en est pas le responsable lit l'objectif, mais ne le change pas : 403")
    void a_member_who_is_not_lead_cannot_change_it(String role) {
        long userId = "MEMBER".equals(role) ? MEMBER : VIEWER;
        stored();

        assertThat(service.get(SLUG, PROJECT, userId).goal()).isEqualTo("Ship the beta");
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, userId, request("Ship it", null, "Fine")))
            .isInstanceOf(ForbiddenException.class).hasMessage(ProjectObjectiveService.CANNOT_EDIT);
        assertThatThrownBy(() -> service.clear(SLUG, PROJECT, userId))
            .isInstanceOf(ForbiddenException.class).hasMessage(ProjectObjectiveService.CANNOT_EDIT);

        verify(objectiveRepository, never()).save(any());
        verify(objectiveRepository, never()).delete(any());
        verifyNoInteractions(audit);
    }

    @Test
    @DisplayName("3. sur un projet public, un membre de l'espace hors du projet lit l'objectif, mais ne le change pas")
    void a_workspace_member_reads_a_public_project_objective() {
        project.setPublic(true);

        assertThat(service.get(SLUG, PROJECT, WS_MEMBER).canEdit()).isFalse();
        assertThatThrownBy(() -> service.set(SLUG, PROJECT, WS_MEMBER, request("Ship it", null, "Fine")))
            .isInstanceOf(ForbiddenException.class);
    }

    @ParameterizedTest(name = "{0} : pose et retire l'objectif")
    @CsvSource({"LEAD", "ADMIN", "OWNER"})
    @DisplayName("3. la responsable du projet, un administrateur ou la propriétaire de l'espace posent et retirent l'objectif")
    void the_lead_and_the_workspace_admins_change_it(String who) {
        long userId = switch (who) {
            case "LEAD" -> LEAD;
            case "ADMIN" -> ADMIN;
            default -> OWNER;
        };

        assertThat(service.set(SLUG, PROJECT, userId, request("Ship it", null, "Fine")).canEdit()).isTrue();
        stored();
        assertThat(service.clear(SLUG, PROJECT, userId).canEdit()).isTrue();

        verify(objectiveRepository).delete(any(ProjectObjective.class));
    }

    @ParameterizedTest(name = "{0} : canEdit = {1}")
    @CsvSource({
        "LEAD,      true",
        "MEMBER,    false",
        "VIEWER,    false",
        "ADMIN,     true",
        "OWNER,     true",
    })
    @DisplayName("canEdit suit exactement la règle qui accorde ou refuse le changement")
    void can_edit_follows_the_same_rule(String who, boolean canEdit) {
        long userId = switch (who) {
            case "LEAD" -> LEAD;
            case "MEMBER" -> MEMBER;
            case "VIEWER" -> VIEWER;
            case "ADMIN" -> ADMIN;
            default -> OWNER;
        };

        assertThat(service.get(SLUG, PROJECT, userId).canEdit()).isEqualTo(canEdit);
        stored();
        assertThat(service.get(SLUG, PROJECT, userId).canEdit()).isEqualTo(canEdit);
    }

    // --------------------------------------------------------------------- le journal

    @Test
    @DisplayName("poser l'objectif entre au journal après le commit : ce qui a changé et combien, jamais le texte")
    void setting_is_audited_after_commit_without_the_text() {
        service.set(SLUG, PROJECT, LEAD, request("Ship the beta", LocalDate.of(2026, 12, 31), "Ten teams use it", "No open P1 bug"));

        ArgumentCaptor<Map<String, Object>> details = details();
        verify(audit).recordAfterCommit(eq(WS), eq(LEAD), eq(AuditService.PROJECT_OBJECTIVE_CHANGED), eq("project"),
            eq(String.valueOf(PROJECT)), details.capture());
        assertThat(details.getValue()).containsExactlyInAnyOrderEntriesOf(
            Map.of("change", "set", "criteria", 2, "targetDate", true));
        assertThat(details.getValue().values()).noneMatch(value -> String.valueOf(value).contains("beta"));
        verify(audit, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("le retirer y entre aussi, avec l'objectif retiré : son nombre de critères et s'il avait une date")
    void clearing_is_audited_after_commit() {
        stored();

        service.clear(SLUG, PROJECT, ADMIN);

        ArgumentCaptor<Map<String, Object>> details = details();
        verify(audit).recordAfterCommit(eq(WS), eq(ADMIN), eq(AuditService.PROJECT_OBJECTIVE_CHANGED), eq("project"),
            eq(String.valueOf(PROJECT)), details.capture());
        assertThat(details.getValue()).containsExactlyInAnyOrderEntriesOf(
            Map.of("change", "cleared", "criteria", 2, "targetDate", true));
    }
}
