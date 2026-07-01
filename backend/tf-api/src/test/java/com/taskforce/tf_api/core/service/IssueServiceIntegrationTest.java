package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
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
import com.taskforce.tf_api.util.AbstractIntegrationTest;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Tests d'intégration (B-T5 tr.2) — {@link IssueService} contre un <b>vrai Postgres</b>.
 *
 * <p>Le service est chargé dans la tranche {@code @DataJpaTest} via {@code @Import} : tous ses
 * repositories sont réels ; seuls les 2 collaborateurs non-repo sont mockés
 * ({@link org.springframework.messaging.simp.SimpMessagingTemplate} et {@code NotificationService}).
 * On teste donc le <b>vrai chemin de persistance</b> : numéro de séquence atomique, statut par
 * défaut, position dans la colonne, journalisation d'activité, réassignation, + les garde-fous
 * (IDOR statut hors projet, non-membre → 403).</p>
 */
@DisplayName("IssueService (intégration Postgres)")
@Import(IssueService.class)
class IssueServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private IssueService issueService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;

    @MockitoBean private SimpMessagingTemplate messagingTemplate;
    @MockitoBean private NotificationService notificationService;

    private static final String SLUG = "ws-issue-it";

    private User owner;
    private Workspace workspace;
    private Project project;
    private IssueStatus doneStatus;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-owner").email("owner@it.dev").displayName("Owner").isActive(true).build());
        workspace = workspaceRepository.save(
            Workspace.builder().name("Issue WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder()
            .workspace(workspace).user(owner).role(WorkspaceRole.OWNER).build());
        project = projectRepository.save(Project.builder()
            .workspace(workspace).name("App").identifier("APP").createdBy(owner).build());

        // Crée les statuts (dont défaut 'Todo'), types et le compteur de séquence.
        issueService.seedDefaultStatusesAndTypes(project);

        doneStatus = issueStatusRepository.findAll().stream()
            .filter(s -> s.getProject().getId().equals(project.getId())
                && s.getCategory() == IssueStatusCategory.COMPLETED)
            .findFirst().orElseThrow();
    }

    private CreateIssueRequest createRequest(String title, Long assigneeId) {
        CreateIssueRequest req = new CreateIssueRequest();
        req.setTitle(title);
        req.setDescription("desc");
        req.setPriority(IssuePriority.HIGH);
        req.setAssigneeId(assigneeId);
        return req;
    }

    // =========================================================================
    @Nested
    @DisplayName("createIssue")
    class Create {

        @Test
        @DisplayName("persiste l'issue (séquence 1, statut défaut, position 0), notifie l'assigné et publie l'événement")
        void should_create_first_issue_with_defaults() {
            IssueResponse res = issueService.createIssue(SLUG, project.getId(), createRequest("Login bug", owner.getId()), owner.getId());

            assertThat(res.getId()).isNotNull();
            assertThat(res.getSequenceNumber()).isEqualTo(1);
            assertThat(res.getTitle()).isEqualTo("Login bug");
            assertThat(res.getPosition()).isZero();
            assertThat(res.getStatus().getName()).isEqualTo("Todo"); // statut par défaut
            assertThat(res.getAssignee().getId()).isEqualTo(owner.getId());

            // réellement en base
            Optional<Issue> persisted = issueRepository.findById(res.getId());
            assertThat(persisted).isPresent();
            assertThat(persisted.get().getPriority()).isEqualTo(IssuePriority.HIGH);

            // effets de bord (mocks)
            verify(notificationService).notifyAssigned(any(Issue.class), any(User.class));
            verify(messagingTemplate).convertAndSend(contains("/topic/projects."), any(Object.class));
        }

        @Test
        @DisplayName("attribue des numéros de séquence atomiques croissants")
        void should_increment_sequence() {
            IssueResponse first = issueService.createIssue(SLUG, project.getId(), createRequest("A", null), owner.getId());
            IssueResponse second = issueService.createIssue(SLUG, project.getId(), createRequest("B", null), owner.getId());

            assertThat(first.getSequenceNumber()).isEqualTo(1);
            assertThat(second.getSequenceNumber()).isEqualTo(2);
        }

        @Test
        @DisplayName("sans assigné : ne notifie personne mais publie quand même l'événement")
        void should_not_notify_when_no_assignee() {
            issueService.createIssue(SLUG, project.getId(), createRequest("No assignee", null), owner.getId());

            verify(notificationService, never()).notifyAssigned(any(), any());
            verify(messagingTemplate, times(1)).convertAndSend(contains("/topic/projects."), any(Object.class));
        }

        @Test
        @DisplayName("lève ResourceNotFoundException si le statut fourni appartient à un autre projet (IDOR)")
        void should_reject_status_from_other_project() {
            // statut d'un autre projet du même workspace
            Project other = projectRepository.save(Project.builder()
                .workspace(workspace).name("Other").identifier("OTH").createdBy(owner).build());
            IssueStatus foreignStatus = issueStatusRepository.save(IssueStatus.builder()
                .project(other).name("Backlog").category(IssueStatusCategory.BACKLOG).build());

            CreateIssueRequest req = createRequest("bad status", null);
            req.setStatusId(foreignStatus.getId());

            assertThatThrownBy(() -> issueService.createIssue(SLUG, project.getId(), req, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("refuse un demandeur non-membre du workspace (BusinessException « Accès refusé »)")
        void should_reject_non_member() {
            User stranger = userRepository.save(User.builder()
                .keycloakId("kc-stranger").email("stranger@it.dev").displayName("Stranger").isActive(true).build());

            assertThatThrownBy(() -> issueService.createIssue(SLUG, project.getId(), createRequest("x", null), stranger.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Accès refusé");
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("updateIssue")
    class Update {

        @Test
        @DisplayName("change le statut et l'assigné, persiste et publie un événement")
        void should_update_status_and_assignee() {
            IssueResponse created = issueService.createIssue(SLUG, project.getId(), createRequest("to update", null), owner.getId());

            UpdateIssueRequest upd = new UpdateIssueRequest();
            upd.setStatusId(doneStatus.getId());
            upd.setAssigneeId(owner.getId());
            upd.setTitle("updated title");

            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), created.getId(), upd, owner.getId());

            assertThat(res.getTitle()).isEqualTo("updated title");
            assertThat(res.getStatus().getName()).isEqualTo("Done");
            assertThat(res.getAssignee().getId()).isEqualTo(owner.getId());

            Issue reloaded = issueRepository.findById(created.getId()).orElseThrow();
            assertThat(reloaded.getStatus().getCategory()).isEqualTo(IssueStatusCategory.COMPLETED);
            assertThat(reloaded.getAssignee().getId()).isEqualTo(owner.getId());

            // 1 publish à la création + >=1 à la mise à jour
            verify(messagingTemplate, times(2)).convertAndSend(contains("/topic/projects."), any(Object.class));
        }

        @Test
        @DisplayName("lève ResourceNotFoundException pour une issue inexistante")
        void should_reject_unknown_issue() {
            UpdateIssueRequest upd = new UpdateIssueRequest();
            upd.setTitle("x");

            assertThatThrownBy(() -> issueService.updateIssue(SLUG, project.getId(), 999_999L, upd, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }
}
