package com.taskforce.tf_api.core.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.request.ApplyRedistributionRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.ApplyRedistributionResponse;
import com.taskforce.tf_api.core.dto.response.RedistributionMoveResponse;
import com.taskforce.tf_api.core.dto.response.RedistributionPlanResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignCandidateResponse;
import com.taskforce.tf_api.core.dto.response.SmartAssignResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link RedistributionService} (PROD-1.12, trou CDC #4).
 * Couvre : plan sûr (déplaçables/URGENT/seuil), choix de cible sans sur-charge, exclusion de
 * l'assigné courant, filtrage par membre, application (IDOR skip + audit), autorisation manager.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("RedistributionService")
class RedistributionServiceTest {

    private static final String SLUG = "ws-demo";
    private static final long WS_ID = 100L;
    private static final long REQUESTER = 1L;
    private static final int THRESHOLD = 8;

    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private IssueRepository issueRepository;
    @Mock private SmartAssignService smartAssignService;
    @Mock private IssueService issueService;
    @Mock private AuthorizationService authorizationService;
    @Mock private AuditService auditService;

    @InjectMocks private RedistributionService service;

    private Workspace workspace;
    private Project project;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "overloadThreshold", THRESHOLD);
        workspace = Workspace.builder().id(WS_ID).slug(SLUG).name("Demo").build();
        project = Project.builder().id(30L).name("Infra").workspace(workspace).build();
    }

    // ---- Fixtures -----------------------------------------------------------

    private User user(long id, String name) {
        return User.builder().id(id).email(name.toLowerCase() + "@ex.dev").displayName(name).isActive(true).build();
    }

    private WorkspaceMember member(User u) {
        return WorkspaceMember.builder().user(u).build();
    }

    private Issue issue(long id, IssueStatusCategory category, IssuePriority priority, User assignee) {
        IssueStatus status = IssueStatus.builder().category(category).build();
        return Issue.builder()
            .id(id).title("Issue " + id).project(project)
            .status(status).priority(priority).storyPoints(3).assignee(assignee)
            .build();
    }

    private SmartAssignCandidateResponse candidate(long userId, String name, int score) {
        return SmartAssignCandidateResponse.builder()
            .userId(userId).email(name.toLowerCase() + "@ex.dev").displayName(name)
            .score(score).reason("charge faible").build();
    }

    private SmartAssignResponse ranked(SmartAssignCandidateResponse recommended,
                                       List<SmartAssignCandidateResponse> alternatives) {
        return SmartAssignResponse.builder()
            .recommended(recommended).alternatives(alternatives)
            .strategy("test").fallbackUsed(true).build();
    }

    /** Ligne renvoyée par countOpenIssuesGroupedByAssignee : {userId, openCount}. */
    private Object[] load(long userId, int count) {
        return new Object[]{userId, count};
    }

    // =========================================================================
    @Nested
    @DisplayName("preview")
    class Preview {

        @Test
        @DisplayName("renvoie un plan vide quand le workspace n'a aucun projet")
        void should_return_empty_plan_when_no_projects() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.of(workspace));
            when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(WS_ID)).thenReturn(List.of());

            RedistributionPlanResponse plan = service.preview(SLUG, REQUESTER, null);

            assertThat(plan.getTotalMoves()).isZero();
            assertThat(plan.getMoves()).isEmpty();
            assertThat(plan.getThreshold()).isEqualTo(THRESHOLD);
            verify(authorizationService).requireManager(WS_ID, REQUESTER);
        }

        @Test
        @DisplayName("ne propose aucun déplacement quand personne n'est en surcharge")
        void should_return_no_moves_when_nobody_overloaded() {
            User a = user(10L, "Alice");
            stubWorkspaceWithProjects();
            when(workspaceMemberRepository.findByWorkspaceId(WS_ID)).thenReturn(List.of(member(a)));
            when(issueRepository.countOpenIssuesGroupedByAssignee(any()))
                .thenReturn(List.<Object[]>of(load(10L, THRESHOLD))); // pile au seuil, pas au-dessus

            RedistributionPlanResponse plan = service.preview(SLUG, REQUESTER, null);

            assertThat(plan.getTotalMoves()).isZero();
            verify(smartAssignService, never()).rankForRedistribution(any(), any(), any());
        }

        @Test
        @DisplayName("propose des déplacements pour un membre surchargé et s'arrête au seuil")
        void should_propose_moves_until_threshold() {
            User a = user(10L, "Alice");   // surchargée
            User b = user(11L, "Bob");     // cible dispo
            stubWorkspaceWithProjects();
            when(workspaceMemberRepository.findByWorkspaceId(WS_ID))
                .thenReturn(List.of(member(a), member(b)));
            when(issueRepository.countOpenIssuesGroupedByAssignee(any()))
                .thenReturn(List.<Object[]>of(load(10L, 10), load(11L, 1))); // Alice 10 > 8 → 2 à déplacer
            // 4 issues déplaçables dispo, mais seulement 2 nécessaires pour revenir au seuil
            when(issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, 10L))
                .thenReturn(List.of(
                    issue(1L, IssueStatusCategory.BACKLOG, IssuePriority.LOW, a),
                    issue(2L, IssueStatusCategory.UNSTARTED, IssuePriority.LOW, a),
                    issue(3L, IssueStatusCategory.BACKLOG, IssuePriority.MEDIUM, a),
                    issue(4L, IssueStatusCategory.UNSTARTED, IssuePriority.MEDIUM, a)));
            when(smartAssignService.rankForRedistribution(any(), any(), any()))
                .thenReturn(ranked(candidate(11L, "Bob", 60), List.of()));

            RedistributionPlanResponse plan = service.preview(SLUG, REQUESTER, null);

            assertThat(plan.getTotalMoves()).isEqualTo(2); // 10 - 8 = 2
            assertThat(plan.getMoves()).allSatisfy(m -> {
                assertThat(m.getFromUserId()).isEqualTo(10L);
                assertThat(m.getToUserId()).isEqualTo(11L);
                assertThat(m.getToScore()).isEqualTo(60);
            });
            // charge avant/après cohérente pour Alice
            assertThat(plan.getMemberLoads()).anySatisfy(l -> {
                assertThat(l.getUserId()).isEqualTo(10L);
                assertThat(l.getOpenBefore()).isEqualTo(10);
                assertThat(l.getOpenAfter()).isEqualTo(8);
                assertThat(l.isOverloaded()).isTrue();
            });
        }

        @Test
        @DisplayName("ignore les issues URGENTES et celles démarrées/terminées (non déplaçables)")
        void should_skip_urgent_and_started_issues() {
            User a = user(10L, "Alice");
            User b = user(11L, "Bob");
            stubWorkspaceWithProjects();
            when(workspaceMemberRepository.findByWorkspaceId(WS_ID))
                .thenReturn(List.of(member(a), member(b)));
            when(issueRepository.countOpenIssuesGroupedByAssignee(any()))
                .thenReturn(List.<Object[]>of(load(10L, 12), load(11L, 0)));
            when(issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, 10L))
                .thenReturn(List.of(
                    issue(1L, IssueStatusCategory.BACKLOG, IssuePriority.URGENT, a),   // exclue (URGENT)
                    issue(2L, IssueStatusCategory.STARTED, IssuePriority.LOW, a),       // exclue (en cours)
                    issue(3L, IssueStatusCategory.COMPLETED, IssuePriority.LOW, a),     // exclue (terminée)
                    issue(4L, IssueStatusCategory.BACKLOG, IssuePriority.LOW, a)));     // seule déplaçable
            when(smartAssignService.rankForRedistribution(any(), any(), any()))
                .thenReturn(ranked(candidate(11L, "Bob", 55), List.of()));

            RedistributionPlanResponse plan = service.preview(SLUG, REQUESTER, null);

            assertThat(plan.getTotalMoves()).isEqualTo(1);
            assertThat(plan.getMoves().get(0).getIssueId()).isEqualTo(4L);
            verify(smartAssignService, times(1)).rankForRedistribution(any(), any(), any());
        }

        @Test
        @DisplayName("exclut l'assigné courant et ne sur-charge pas la cible")
        void should_exclude_current_assignee_and_not_overload_target() {
            User a = user(10L, "Alice");  // surchargée 13
            User b = user(11L, "Bob");    // recommandé MAIS déjà au seuil (8) → exclu
            User c = user(12L, "Carol");  // alternative dispo (2) → choisi
            stubWorkspaceWithProjects();
            when(workspaceMemberRepository.findByWorkspaceId(WS_ID))
                .thenReturn(List.of(member(a), member(b), member(c)));
            when(issueRepository.countOpenIssuesGroupedByAssignee(any()))
                .thenReturn(List.<Object[]>of(load(10L, 13), load(11L, 8), load(12L, 2)));
            when(issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, 10L))
                .thenReturn(List.of(issue(1L, IssueStatusCategory.BACKLOG, IssuePriority.LOW, a)));
            // recommandé = Alice elle-même (exclue) + Bob (au seuil, exclu) ; alternative = Carol
            when(smartAssignService.rankForRedistribution(any(), any(), any()))
                .thenReturn(ranked(candidate(10L, "Alice", 90),
                    List.of(candidate(11L, "Bob", 70), candidate(12L, "Carol", 50))));

            RedistributionPlanResponse plan = service.preview(SLUG, REQUESTER, null);

            assertThat(plan.getTotalMoves()).isEqualTo(1);
            assertThat(plan.getMoves().get(0).getToUserId()).isEqualTo(12L); // Carol
        }

        @Test
        @DisplayName("ne propose rien si aucun candidat sûr n'est disponible")
        void should_propose_nothing_when_no_safe_target() {
            User a = user(10L, "Alice");
            User b = user(11L, "Bob");
            stubWorkspaceWithProjects();
            when(workspaceMemberRepository.findByWorkspaceId(WS_ID))
                .thenReturn(List.of(member(a), member(b)));
            when(issueRepository.countOpenIssuesGroupedByAssignee(any()))
                .thenReturn(List.<Object[]>of(load(10L, 13), load(11L, 9))); // Bob déjà surchargé
            when(issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, 10L))
                .thenReturn(List.of(issue(1L, IssueStatusCategory.BACKLOG, IssuePriority.LOW, a)));
            when(smartAssignService.rankForRedistribution(any(), any(), any()))
                .thenReturn(ranked(candidate(11L, "Bob", 60), List.of())); // seul candidat = surchargé

            RedistributionPlanResponse plan = service.preview(SLUG, REQUESTER, null);

            assertThat(plan.getTotalMoves()).isZero();
        }

        @Test
        @DisplayName("restreint le plan au membre ciblé quand userId est fourni")
        void should_restrict_to_target_user_when_provided() {
            User a = user(10L, "Alice");
            User d = user(13L, "Dan");
            User b = user(11L, "Bob");
            stubWorkspaceWithProjects();
            when(workspaceMemberRepository.findByWorkspaceId(WS_ID))
                .thenReturn(List.of(member(a), member(d), member(b)));
            when(issueRepository.countOpenIssuesGroupedByAssignee(any()))
                .thenReturn(List.<Object[]>of(load(10L, 12), load(13L, 11), load(11L, 0))); // 2 surchargés
            when(issueRepository.findByWorkspaceSlugAndAssigneeId(SLUG, 13L))
                .thenReturn(List.of(issue(9L, IssueStatusCategory.BACKLOG, IssuePriority.LOW, d)));
            when(smartAssignService.rankForRedistribution(any(), any(), any()))
                .thenReturn(ranked(candidate(11L, "Bob", 60), List.of()));

            RedistributionPlanResponse plan = service.preview(SLUG, REQUESTER, 13L);

            // seul Dan (13) est traité, pas Alice (10)
            assertThat(plan.getMoves()).isNotEmpty();
            assertThat(plan.getMoves()).allSatisfy(m -> assertThat(m.getFromUserId()).isEqualTo(13L));
            verify(issueRepository, never()).findByWorkspaceSlugAndAssigneeId(SLUG, 10L);
        }

        @Test
        @DisplayName("lève ResourceNotFoundException si le workspace est introuvable")
        void should_throw_when_workspace_not_found() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.empty());

            assertThatThrownBy(() -> service.preview(SLUG, REQUESTER, null))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("propage l'interdiction si l'appelant n'est pas manager")
        void should_throw_forbidden_when_not_manager() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.of(workspace));
            org.mockito.Mockito.doThrow(new ForbiddenException("nope"))
                .when(authorizationService).requireManager(WS_ID, REQUESTER);

            assertThatThrownBy(() -> service.preview(SLUG, REQUESTER, null))
                .isInstanceOf(ForbiddenException.class);
            verify(projectRepository, never()).findByWorkspaceIdOrderByCreatedAtDesc(anyLong());
        }

        private void stubWorkspaceWithProjects() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.of(workspace));
            when(projectRepository.findByWorkspaceIdOrderByCreatedAtDesc(WS_ID)).thenReturn(List.of(project));
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("apply")
    class Apply {

        @Test
        @DisplayName("applique les déplacements valides, réassigne et journalise l'audit")
        void should_apply_valid_moves_and_audit() {
            Issue i1 = issue(1L, IssueStatusCategory.BACKLOG, IssuePriority.LOW, user(10L, "Alice"));
            Issue i2 = issue(2L, IssueStatusCategory.UNSTARTED, IssuePriority.MEDIUM, user(10L, "Alice"));
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.of(workspace));
            when(issueRepository.findById(1L)).thenReturn(java.util.Optional.of(i1));
            when(issueRepository.findById(2L)).thenReturn(java.util.Optional.of(i2));
            when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS_ID, 11L)).thenReturn(true);

            ApplyRedistributionResponse res = service.apply(SLUG, REQUESTER, request(move(1L, 11L), move(2L, 11L)));

            assertThat(res.getApplied()).isEqualTo(2);
            assertThat(res.getSkipped()).isZero();

            ArgumentCaptor<UpdateIssueRequest> captor = ArgumentCaptor.forClass(UpdateIssueRequest.class);
            verify(issueService, times(2)).updateIssue(eq(SLUG), eq(30L), anyLong(), captor.capture(), eq(REQUESTER));
            assertThat(captor.getAllValues()).allSatisfy(u -> assertThat(u.getAssigneeId()).isEqualTo(11L));
            verify(auditService).record(eq(WS_ID), eq(REQUESTER), eq(AuditService.REDISTRIBUTION_APPLY),
                eq("WORKSPACE"), eq(String.valueOf(WS_ID)), any());
        }

        @Test
        @DisplayName("ignore une issue hors du workspace (défense IDOR)")
        void should_skip_issue_from_another_workspace() {
            Workspace other = Workspace.builder().id(999L).slug("other").build();
            Project otherProject = Project.builder().id(77L).name("X").workspace(other).build();
            Issue foreign = Issue.builder().id(5L).title("foreign").project(otherProject)
                .status(IssueStatus.builder().category(IssueStatusCategory.BACKLOG).build())
                .priority(IssuePriority.LOW).build();
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.of(workspace));
            when(issueRepository.findById(5L)).thenReturn(java.util.Optional.of(foreign));

            ApplyRedistributionResponse res = service.apply(SLUG, REQUESTER, request(move(5L, 11L)));

            assertThat(res.getApplied()).isZero();
            assertThat(res.getSkipped()).isEqualTo(1);
            verify(issueService, never()).updateIssue(any(), anyLong(), anyLong(), any(), anyLong());
            verify(auditService).record(eq(WS_ID), eq(REQUESTER), eq(AuditService.REDISTRIBUTION_APPLY),
                any(), any(), any());
        }

        @Test
        @DisplayName("ignore un déplacement dont la cible n'est pas membre du workspace")
        void should_skip_when_target_not_member() {
            Issue i1 = issue(1L, IssueStatusCategory.BACKLOG, IssuePriority.LOW, user(10L, "Alice"));
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.of(workspace));
            when(issueRepository.findById(1L)).thenReturn(java.util.Optional.of(i1));
            when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WS_ID, 42L)).thenReturn(false);

            ApplyRedistributionResponse res = service.apply(SLUG, REQUESTER, request(move(1L, 42L)));

            assertThat(res.getApplied()).isZero();
            assertThat(res.getSkipped()).isEqualTo(1);
            verify(issueService, never()).updateIssue(any(), anyLong(), anyLong(), any(), anyLong());
        }

        @Test
        @DisplayName("propage l'interdiction si l'appelant n'est pas manager")
        void should_throw_forbidden_when_not_manager() {
            when(workspaceRepository.findBySlug(SLUG)).thenReturn(java.util.Optional.of(workspace));
            org.mockito.Mockito.doThrow(new ForbiddenException("nope"))
                .when(authorizationService).requireManager(WS_ID, REQUESTER);

            assertThatThrownBy(() -> service.apply(SLUG, REQUESTER, request(move(1L, 11L))))
                .isInstanceOf(ForbiddenException.class);
            verify(issueService, never()).updateIssue(any(), anyLong(), anyLong(), any(), anyLong());
            verify(auditService, never()).record(anyLong(), anyLong(), any(), any(), any(), any());
        }

        private ApplyRedistributionRequest request(ApplyRedistributionRequest.Move... moves) {
            ApplyRedistributionRequest req = new ApplyRedistributionRequest();
            req.setMoves(List.of(moves));
            return req;
        }

        private ApplyRedistributionRequest.Move move(long issueId, long toUserId) {
            ApplyRedistributionRequest.Move m = new ApplyRedistributionRequest.Move();
            m.setIssueId(issueId);
            m.setToUserId(toUserId);
            return m;
        }
    }
}
