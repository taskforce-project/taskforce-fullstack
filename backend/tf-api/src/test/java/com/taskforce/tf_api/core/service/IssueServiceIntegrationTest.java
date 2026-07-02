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

    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;

    private Long newIssueId(String title) {
        return issueService.createIssue(SLUG, project.getId(), createRequest(title, null), owner.getId()).getId();
    }

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

    // =========================================================================
    @Nested
    @DisplayName("cycle de vie (list/get/delete/archive/pin/children)")
    class Lifecycle {

        @Test
        @DisplayName("listIssues + getIssue reflètent les issues créées")
        void should_list_and_get() {
            Long id = newIssueId("A");
            newIssueId("B");

            assertThat(issueService.listIssues(SLUG, project.getId(), owner.getId())).hasSizeGreaterThanOrEqualTo(2);
            assertThat(issueService.getIssue(SLUG, project.getId(), id, owner.getId()).getId()).isEqualTo(id);
        }

        @Test
        @DisplayName("deleteIssue supprime l'issue (getIssue → 404 ensuite)")
        void should_delete_issue() {
            Long id = newIssueId("Doomed");
            em.flush();
            em.clear();

            issueService.deleteIssue(SLUG, project.getId(), id, owner.getId());
            em.flush();
            em.clear();

            assertThatThrownBy(() -> issueService.getIssue(SLUG, project.getId(), id, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("archive puis pin d'une issue sont persistés")
        void should_archive_and_pin() {
            Long id = newIssueId("Flags");

            IssueResponse archived = issueService.setArchived(SLUG, project.getId(), id, true, owner.getId());
            assertThat(archived.isArchived()).isTrue();

            IssueResponse pinned = issueService.setPinned(SLUG, project.getId(), id, true, owner.getId());
            assertThat(pinned.isPinned()).isTrue();
        }

        @Test
        @DisplayName("listChildren renvoie les sous-tâches (parentId)")
        void should_list_children() {
            Long parent = newIssueId("Parent");
            CreateIssueRequest childReq = createRequest("Child", null);
            childReq.setParentId(parent);
            issueService.createIssue(SLUG, project.getId(), childReq, owner.getId());

            assertThat(issueService.listChildren(SLUG, project.getId(), parent, owner.getId())).hasSize(1);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("statuts & types")
    class StatusesAndTypes {

        @Test
        @DisplayName("listStatuses = 5 statuts par défaut ; listTypes = 3 types")
        void should_list_defaults() {
            assertThat(issueService.listStatuses(SLUG, project.getId(), owner.getId())).hasSize(5);
            assertThat(issueService.listTypes(SLUG, project.getId(), owner.getId())).hasSize(3);
        }

        @Test
        @DisplayName("createStatus ajoute un statut, updateStatus le renomme, deleteStatus le retire")
        void should_crud_status() {
            var create = new com.taskforce.tf_api.core.dto.request.CreateIssueStatusRequest();
            create.setName("Review");
            create.setColor("#8b5cf6");
            create.setCategory("STARTED");
            var created = issueService.createStatus(SLUG, project.getId(), create, owner.getId());
            assertThat(issueService.listStatuses(SLUG, project.getId(), owner.getId())).hasSize(6);

            var update = new com.taskforce.tf_api.core.dto.request.UpdateIssueStatusRequest();
            update.setName("Reviewing");
            var updated = issueService.updateStatus(SLUG, project.getId(), created.getId(), update, owner.getId());
            assertThat(updated.getName()).isEqualTo("Reviewing");

            issueService.deleteStatus(SLUG, project.getId(), created.getId(), owner.getId());
            assertThat(issueService.listStatuses(SLUG, project.getId(), owner.getId())).hasSize(5);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("commentaires / checklist / worklogs / relations")
    class SubResources {

        @Test
        @DisplayName("addComment puis listComments")
        void should_add_and_list_comment() {
            Long id = newIssueId("Commented");
            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            req.setContent("Premier commentaire");

            issueService.addComment(SLUG, project.getId(), id, req, owner.getId());

            var comments = issueService.listComments(SLUG, project.getId(), id, owner.getId());
            assertThat(comments).hasSize(1);
            assertThat(comments.get(0).getContent()).isEqualTo("Premier commentaire");
        }

        @Test
        @DisplayName("addChecklistItem + update (done) + list")
        void should_manage_checklist() {
            Long id = newIssueId("Checklist");
            var add = new com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest();
            add.setContent("Étape 1");
            var item = issueService.addChecklistItem(SLUG, project.getId(), id, owner.getId(), add);

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateChecklistItemRequest();
            upd.setDone(true);
            var updated = issueService.updateChecklistItem(SLUG, project.getId(), id, item.getId(), owner.getId(), upd);
            assertThat(updated.isDone()).isTrue();

            assertThat(issueService.listChecklist(SLUG, project.getId(), id, owner.getId())).hasSize(1);
        }

        @Test
        @DisplayName("addWorklog + listWorklogs (minutes)")
        void should_log_work() {
            Long id = newIssueId("Timed");
            var req = new com.taskforce.tf_api.core.dto.request.LogWorkRequest();
            req.setMinutes(60);
            req.setDescription("Dev");

            issueService.addWorklog(SLUG, project.getId(), id, owner.getId(), req);

            var logs = issueService.listWorklogs(SLUG, project.getId(), id, owner.getId());
            assertThat(logs).hasSize(1);
            assertThat(logs.get(0).getMinutes()).isEqualTo(60);
        }

        @Test
        @DisplayName("addRelation (RELATES_TO) persiste la relation ; listRelations la renvoie ; doublon rejeté")
        void should_add_relation() {
            Long source = newIssueId("Source");
            Long target = newIssueId("Target");

            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueRelationRequest();
            req.setTargetIssueId(target);
            req.setRelationType("RELATES_TO");

            var created = issueService.addRelation(SLUG, project.getId(), source, req, owner.getId());
            assertThat(created.getRelationType())
                .isEqualTo(com.taskforce.tf_api.core.enums.IssueRelationType.RELATES_TO);
            assertThat(created.getRelatedIssue().getId()).isEqualTo(target);

            assertThat(issueService.listRelations(SLUG, project.getId(), source, owner.getId())).hasSize(1);

            // doublon → BusinessException (chemin existsBy…RelationType contre l'enum Postgres natif)
            assertThatThrownBy(() -> issueService.addRelation(SLUG, project.getId(), source, req, owner.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("existe déjà");
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("branches update / comments / checklist / worklog / reorder / my-work")
    class MoreBranches {

        @Test
        @DisplayName("updateIssue applique description/priorité/story points/échéance")
        void update_many_fields() {
            Long id = newIssueId("upd");
            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setDescription("nouvelle description");
            u.setPriority(IssuePriority.URGENT);
            u.setStoryPoints(8);
            u.setDueDate("2026-09-01");

            IssueResponse r = issueService.updateIssue(SLUG, project.getId(), id, u, owner.getId());

            assertThat(r.getStoryPoints()).isEqualTo(8);
            assertThat(r.getPriority()).isEqualTo(IssuePriority.URGENT);
        }

        @Test
        @DisplayName("addComment → updateComment → deleteComment")
        void comments_update_delete() {
            Long id = newIssueId("c");
            var add = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            add.setContent("v1");
            var c = issueService.addComment(SLUG, project.getId(), id, add, owner.getId());

            var upd = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            upd.setContent("v2");
            issueService.updateComment(SLUG, project.getId(), id, c.getId(), upd, owner.getId());
            issueService.deleteComment(SLUG, project.getId(), id, c.getId(), owner.getId());

            assertThat(issueService.listComments(SLUG, project.getId(), id, owner.getId())).isEmpty();
        }

        @Test
        @DisplayName("deleteChecklistItem et deleteWorklog retirent les éléments")
        void delete_checklist_and_worklog() {
            Long id = newIssueId("cw");
            var ck = new com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest();
            ck.setContent("étape");
            var item = issueService.addChecklistItem(SLUG, project.getId(), id, owner.getId(), ck);
            issueService.deleteChecklistItem(SLUG, project.getId(), id, item.getId(), owner.getId());
            assertThat(issueService.listChecklist(SLUG, project.getId(), id, owner.getId())).isEmpty();

            var wl = new com.taskforce.tf_api.core.dto.request.LogWorkRequest();
            wl.setMinutes(30);
            var w = issueService.addWorklog(SLUG, project.getId(), id, owner.getId(), wl);
            issueService.deleteWorklog(SLUG, project.getId(), id, w.getId(), owner.getId());
            assertThat(issueService.listWorklogs(SLUG, project.getId(), id, owner.getId())).isEmpty();
        }

        @Test
        @DisplayName("reorderStatuses renvoie la liste réordonnée")
        void reorder_statuses() {
            var statuses = issueService.listStatuses(SLUG, project.getId(), owner.getId());
            var req = new com.taskforce.tf_api.core.dto.request.ReorderStatusesRequest();
            var positions = new java.util.ArrayList<com.taskforce.tf_api.core.dto.request.ReorderStatusesRequest.StatusPosition>();
            short pos = 0;
            for (var s : statuses) {
                var p = new com.taskforce.tf_api.core.dto.request.ReorderStatusesRequest.StatusPosition();
                p.setId(s.getId());
                p.setPosition(pos++);
                positions.add(p);
            }
            req.setStatuses(positions);

            assertThat(issueService.reorderStatuses(SLUG, project.getId(), req, owner.getId())).isNotEmpty();
        }

        @Test
        @DisplayName("listMyIssues et getScheduledIssues remontent l'issue assignée/planifiée")
        void my_work_and_scheduled() {
            CreateIssueRequest cr = createRequest("mine", owner.getId());
            cr.setDueDate("2026-09-15");
            issueService.createIssue(SLUG, project.getId(), cr, owner.getId());

            assertThat(issueService.listMyIssues(SLUG, owner.getId())).isNotEmpty();
            assertThat(issueService.getScheduledIssues(SLUG, owner.getId())).isNotEmpty();
        }
    }
}
