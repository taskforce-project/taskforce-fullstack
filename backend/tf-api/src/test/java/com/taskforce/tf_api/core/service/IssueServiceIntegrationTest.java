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
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.request.UpdateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectLabel;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.ProjectLabelRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
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
@Import({IssueService.class, ProjectVisibilityGuard.class, PlanFeatureService.class})
class IssueServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private IssueService issueService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private ProjectLabelRepository projectLabelRepository;
    @Autowired private ProjectMemberRepository projectMemberRepository;

    @MockitoBean private SimpMessagingTemplate messagingTemplate;
    @MockitoBean private NotificationService notificationService;
    @MockitoBean private SlackIntegrationService slackService;  // push Slack sur issue.created (no-op en test)

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

        // Bean issueService partagé entre tests : rétention d'historique désactivée par défaut
        // (le test dédié HistoryRetention la règle explicitement), sinon la valeur fuiterait d'un test à l'autre.
        ReflectionTestUtils.setField(issueService, "historyRetentionLimit", Integer.MAX_VALUE);
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
            // push Slack déclenché sur issue.created
            verify(slackService).notifyEvent(
                org.mockito.ArgumentMatchers.eq(workspace.getId()),
                org.mockito.ArgumentMatchers.eq("issue.created"),
                org.mockito.ArgumentMatchers.anyString());
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

        @Test
        @DisplayName("updateIssue applique tous les champs (title/desc/priorité/statut/assigné/dates/SP/type)")
        void update_all_fields() {
            Long id = newIssueId("full");
            Long typeId = issueService.listTypes(SLUG, project.getId(), owner.getId()).get(0).getId();

            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setTitle("Titre complet");
            u.setDescription("desc complète");
            u.setPriority(IssuePriority.HIGH);
            u.setStatusId(doneStatus.getId());
            u.setAssigneeId(owner.getId());
            u.setTypeId(typeId);
            u.setStartDate("2026-09-01");
            u.setDueDate("2026-09-30");
            u.setStoryPoints(5);

            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), id, u, owner.getId());

            assertThat(res.getTitle()).isEqualTo("Titre complet");
            assertThat(res.getStatus().getName()).isEqualTo("Done");
            assertThat(res.getStoryPoints()).isEqualTo(5);
        }

        @Test
        @DisplayName("listIssuesPaged renvoie une page")
        void list_paged() {
            newIssueId("p1");
            newIssueId("p2");
            var page = issueService.listIssuesPaged(SLUG, project.getId(), owner.getId(),
                org.springframework.data.domain.PageRequest.of(0, 10));
            assertThat(page).isNotNull();
        }

        // ---- Ajouts couverture (méthodes/branches non couvertes) ----

        @Test
        @DisplayName("listActivity renvoie le journal d'activité (au moins l'entrée CREATED)")
        void should_list_activity() {
            Long id = newIssueId("Activité");

            var activity = issueService.listActivity(SLUG, project.getId(), id, owner.getId());

            assertThat(activity).isNotEmpty();
            assertThat(activity).anyMatch(a -> a.getAction()
                == com.taskforce.tf_api.core.enums.IssueActivityType.CREATED);
        }

        @Test
        @DisplayName("listActivity lève ResourceNotFoundException pour une issue inexistante")
        void should_reject_activity_unknown_issue() {
            assertThatThrownBy(() -> issueService.listActivity(SLUG, project.getId(), 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("deleteRelation supprime la relation ; listRelations est alors vide")
        void should_delete_relation() {
            Long source = newIssueId("RelSource");
            Long target = newIssueId("RelTarget");

            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueRelationRequest();
            req.setTargetIssueId(target);
            req.setRelationType("RELATES_TO");
            var created = issueService.addRelation(SLUG, project.getId(), source, req, owner.getId());

            issueService.deleteRelation(SLUG, project.getId(), source, created.getId(), owner.getId());

            assertThat(issueService.listRelations(SLUG, project.getId(), source, owner.getId())).isEmpty();
        }

        @Test
        @DisplayName("deleteRelation lève ResourceNotFoundException pour une relation inexistante")
        void should_reject_delete_unknown_relation() {
            Long id = newIssueId("RelNone");
            assertThatThrownBy(() -> issueService.deleteRelation(SLUG, project.getId(), id, 999_999L, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("addRelation refuse un type de relation invalide (BusinessException)")
        void should_reject_invalid_relation_type() {
            Long source = newIssueId("BadRelSource");
            Long target = newIssueId("BadRelTarget");
            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueRelationRequest();
            req.setTargetIssueId(target);
            req.setRelationType("NOT_A_TYPE");

            assertThatThrownBy(() -> issueService.addRelation(SLUG, project.getId(), source, req, owner.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Type de relation invalide");
        }

        @Test
        @DisplayName("updateChecklistItem met à jour le contenu de l'item")
        void should_update_checklist_content() {
            Long id = newIssueId("CkContent");
            var add = new com.taskforce.tf_api.core.dto.request.CreateChecklistItemRequest();
            add.setContent("Ancien");
            var item = issueService.addChecklistItem(SLUG, project.getId(), id, owner.getId(), add);

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateChecklistItemRequest();
            upd.setContent("Nouveau contenu");
            var updated = issueService.updateChecklistItem(SLUG, project.getId(), id, item.getId(), owner.getId(), upd);

            assertThat(updated.getContent()).isEqualTo("Nouveau contenu");
        }

        @Test
        @DisplayName("updateChecklistItem lève ResourceNotFoundException pour un item inexistant")
        void should_reject_update_unknown_checklist_item() {
            Long id = newIssueId("CkNone");
            var upd = new com.taskforce.tf_api.core.dto.request.UpdateChecklistItemRequest();
            upd.setDone(true);
            assertThatThrownBy(() -> issueService.updateChecklistItem(
                    SLUG, project.getId(), id, 999_999L, owner.getId(), upd))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("updateComment refuse la modification par un non-auteur (BusinessException)")
        void should_reject_update_comment_by_non_author() {
            Long id = newIssueId("CmtOther");
            var add = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            add.setContent("original");
            var c = issueService.addComment(SLUG, project.getId(), id, add, owner.getId());

            // Un autre membre du workspace
            User other = userRepository.save(User.builder()
                .keycloakId("kc-other-cmt").email("other@it.dev").displayName("Other").isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(workspace).user(other).role(WorkspaceRole.MEMBER).build());
            // Membre du projet → peut écrire ; le refus vient donc du contrôle d'AUTEUR, pas de la visibilité.
            projectMemberRepository.save(ProjectMember.builder()
                .project(project).user(other).role(ProjectRole.MEMBER).build());

            var upd = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            upd.setContent("tentative");
            assertThatThrownBy(() -> issueService.updateComment(
                    SLUG, project.getId(), id, c.getId(), upd, other.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("vos propres commentaires");
        }

        @Test
        @DisplayName("deleteWorklog refuse la suppression par un non-auteur (BusinessException)")
        void should_reject_delete_worklog_by_non_author() {
            Long id = newIssueId("WlOther");
            var wl = new com.taskforce.tf_api.core.dto.request.LogWorkRequest();
            wl.setMinutes(45);
            var w = issueService.addWorklog(SLUG, project.getId(), id, owner.getId(), wl);

            User other = userRepository.save(User.builder()
                .keycloakId("kc-other-wl").email("otherwl@it.dev").displayName("OtherWl").isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(workspace).user(other).role(WorkspaceRole.MEMBER).build());
            // Membre du projet → peut écrire ; le refus vient donc du contrôle d'AUTEUR, pas de la visibilité.
            projectMemberRepository.save(ProjectMember.builder()
                .project(project).user(other).role(ProjectRole.MEMBER).build());

            assertThatThrownBy(() -> issueService.deleteWorklog(
                    SLUG, project.getId(), id, w.getId(), other.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("vos propres entrées");
        }

        @Test
        @DisplayName("createStatus refuse un nom de statut déjà existant (BusinessException)")
        void should_reject_duplicate_status_name() {
            var create = new com.taskforce.tf_api.core.dto.request.CreateIssueStatusRequest();
            create.setName("Done"); // existe déjà (statut par défaut)
            create.setColor("#000000");
            create.setCategory("COMPLETED");

            assertThatThrownBy(() -> issueService.createStatus(SLUG, project.getId(), create, owner.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("existe déjà");
        }

        @Test
        @DisplayName("deleteStatus refuse la suppression du statut par défaut (BusinessException)")
        void should_reject_delete_default_status() {
            var defaultStatus = issueService.listStatuses(SLUG, project.getId(), owner.getId()).stream()
                .filter(com.taskforce.tf_api.core.dto.response.IssueStatusResponse::isDefault)
                .findFirst().orElseThrow();

            assertThatThrownBy(() -> issueService.deleteStatus(
                    SLUG, project.getId(), defaultStatus.getId(), owner.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("statut par défaut");
        }

        @Test
        @DisplayName("getScheduledIssues refuse un demandeur non-membre du workspace (BusinessException)")
        void should_reject_scheduled_non_member() {
            User stranger = userRepository.save(User.builder()
                .keycloakId("kc-stranger-sched").email("strangersched@it.dev").displayName("StrangerS").isActive(true).build());

            assertThatThrownBy(() -> issueService.getScheduledIssues(SLUG, stranger.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Accès refusé");
        }

        @Test
        @DisplayName("listMyIssues lève ResourceNotFoundException pour un workspace inexistant")
        void should_reject_my_issues_unknown_workspace() {
            assertThatThrownBy(() -> issueService.listMyIssues("slug-inexistant", owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    // Ajouts couverture profonde — updateIssue (branches par champ), resolveMentions,
    // createIssue (branches optionnelles), listStatuses/updateStatus.
    // =========================================================================
    @Nested
    @DisplayName("branches profondes updateIssue (par champ)")
    class DeepUpdate {

        /** Crée un second membre du workspace, réutilisable comme assigné. */
        private User newMember(String kc) {
            User u = userRepository.save(User.builder()
                .keycloakId(kc).email(kc + "@it.dev").displayName("M-" + kc).isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(workspace).user(u).role(WorkspaceRole.MEMBER).build());
            return u;
        }

        private ProjectLabel newLabel(String name) {
            return projectLabelRepository.save(ProjectLabel.builder()
                .project(project).name(name).color("#123456").build());
        }

        @Test
        @DisplayName("assigner un nouvel assigné déclenche notifyAssigned et journalise ASSIGNEE_CHANGED")
        void assign_triggers_notification() {
            Long id = newIssueId("assign");
            User member = newMember("kc-assignee");

            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setAssigneeId(member.getId());

            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), id, u, owner.getId());

            assertThat(res.getAssignee().getId()).isEqualTo(member.getId());
            Issue reloaded = issueRepository.findById(id).orElseThrow();
            assertThat(reloaded.getAssignee().getId()).isEqualTo(member.getId());
            verify(notificationService).notifyAssigned(any(Issue.class), any(User.class));
        }

        @Test
        @DisplayName("passer au statut COMPLETED renseigne completedAt et notifie le changement de statut")
        void status_to_completed_sets_completedAt() {
            Long id = newIssueId("toDone");

            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setStatusId(doneStatus.getId());

            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), id, u, owner.getId());

            assertThat(res.getStatus().getName()).isEqualTo("Done");
            assertThat(res.getCompletedAt()).isNotNull();
            Issue reloaded = issueRepository.findById(id).orElseThrow();
            assertThat(reloaded.getCompletedAt()).isNotNull();
            verify(notificationService).notifyStatusChanged(any(Issue.class), any(User.class), contains("Done"));
        }

        @Test
        @DisplayName("rouvrir une issue terminée (statut non COMPLETED) remet completedAt à null")
        void status_reopen_clears_completedAt() {
            Long id = newIssueId("reopen");

            // 1) terminer
            UpdateIssueRequest done = new UpdateIssueRequest();
            done.setStatusId(doneStatus.getId());
            issueService.updateIssue(SLUG, project.getId(), id, done, owner.getId());
            assertThat(issueRepository.findById(id).orElseThrow().getCompletedAt()).isNotNull();

            // 2) rouvrir → statut UNSTARTED (Todo par défaut)
            IssueStatus todo = issueStatusRepository.findByProjectIdOrderByPosition(project.getId()).stream()
                .filter(s -> s.getCategory() == IssueStatusCategory.UNSTARTED)
                .findFirst().orElseThrow();
            UpdateIssueRequest reopen = new UpdateIssueRequest();
            reopen.setStatusId(todo.getId());
            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), id, reopen, owner.getId());

            assertThat(res.getCompletedAt()).isNull();
            assertThat(issueRepository.findById(id).orElseThrow().getCompletedAt()).isNull();
        }

        @Test
        @DisplayName("changer de parent journalise PARENT_CHANGED et persiste le nouveau parent")
        void change_parent() {
            Long parentA = newIssueId("parentA");
            Long parentB = newIssueId("parentB");
            Long child = newIssueId("child");

            UpdateIssueRequest toA = new UpdateIssueRequest();
            toA.setParentId(parentA);
            issueService.updateIssue(SLUG, project.getId(), child, toA, owner.getId());

            UpdateIssueRequest toB = new UpdateIssueRequest();
            toB.setParentId(parentB);
            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), child, toB, owner.getId());

            assertThat(res.getParent().getId()).isEqualTo(parentB);
            Issue reloaded = issueRepository.findById(child).orElseThrow();
            assertThat(reloaded.getParent().getId()).isEqualTo(parentB);
        }

        @Test
        @DisplayName("changer les labels (ajout puis remplacement) journalise LABEL_ADDED/LABEL_REMOVED")
        void change_labels() {
            Long id = newIssueId("labels");
            ProjectLabel l1 = newLabel("urgent");
            ProjectLabel l2 = newLabel("backend");
            ProjectLabel l3 = newLabel("frontend");

            // 1) ajouter l1 + l2
            UpdateIssueRequest add = new UpdateIssueRequest();
            add.setLabelIds(List.of(l1.getId(), l2.getId()));
            IssueResponse res1 = issueService.updateIssue(SLUG, project.getId(), id, add, owner.getId());
            assertThat(res1.getLabels()).extracting(l -> l.getId())
                .containsExactlyInAnyOrder(l1.getId(), l2.getId());

            em.flush();
            em.clear();

            // 2) remplacer par l2 + l3 (retire l1, ajoute l3)
            UpdateIssueRequest replace = new UpdateIssueRequest();
            replace.setLabelIds(List.of(l2.getId(), l3.getId()));
            IssueResponse res2 = issueService.updateIssue(SLUG, project.getId(), id, replace, owner.getId());
            assertThat(res2.getLabels()).extracting(l -> l.getId())
                .containsExactlyInAnyOrder(l2.getId(), l3.getId());

            // journal contient bien un LABEL_ADDED et un LABEL_REMOVED
            var actions = issueService.listActivity(SLUG, project.getId(), id, owner.getId()).stream()
                .map(a -> a.getAction()).toList();
            assertThat(actions).contains(
                com.taskforce.tf_api.core.enums.IssueActivityType.LABEL_ADDED,
                com.taskforce.tf_api.core.enums.IssueActivityType.LABEL_REMOVED);
        }

        @Test
        @DisplayName("labelIds = liste vide retire tous les labels de l'issue")
        void clear_labels_with_empty_list() {
            Long id = newIssueId("clearLabels");
            ProjectLabel l1 = newLabel("temp");

            UpdateIssueRequest add = new UpdateIssueRequest();
            add.setLabelIds(List.of(l1.getId()));
            issueService.updateIssue(SLUG, project.getId(), id, add, owner.getId());

            em.flush();
            em.clear();

            UpdateIssueRequest clear = new UpdateIssueRequest();
            clear.setLabelIds(List.of());
            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), id, clear, owner.getId());

            assertThat(res.getLabels()).isEmpty();
        }

        @Test
        @DisplayName("storyPoints = 0 retire l'estimation (null en base)")
        void story_points_zero_clears_estimate() {
            Long id = newIssueId("sp");

            UpdateIssueRequest set = new UpdateIssueRequest();
            set.setStoryPoints(13);
            IssueResponse withSp = issueService.updateIssue(SLUG, project.getId(), id, set, owner.getId());
            assertThat(withSp.getStoryPoints()).isEqualTo(13);

            UpdateIssueRequest clear = new UpdateIssueRequest();
            clear.setStoryPoints(0);
            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), id, clear, owner.getId());

            assertThat(res.getStoryPoints()).isNull();
            assertThat(issueRepository.findById(id).orElseThrow().getStoryPoints()).isNull();
        }

        @Test
        @DisplayName("changer le type journalise TYPE_CHANGED et persiste le nouveau type")
        void change_type() {
            Long id = newIssueId("type");
            var types = issueService.listTypes(SLUG, project.getId(), owner.getId());
            Long typeId = types.get(types.size() - 1).getId();

            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setTypeId(typeId);
            IssueResponse res = issueService.updateIssue(SLUG, project.getId(), id, u, owner.getId());

            assertThat(res.getType().getId()).isEqualTo(typeId);
        }

        @Test
        @DisplayName("changer le titre pour une valeur identique ne journalise pas TITLE_CHANGED")
        void same_title_no_activity() {
            Long id = newIssueId("Titre stable");

            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setTitle("Titre stable"); // identique à l'existant
            issueService.updateIssue(SLUG, project.getId(), id, u, owner.getId());

            var actions = issueService.listActivity(SLUG, project.getId(), id, owner.getId()).stream()
                .map(a -> a.getAction()).toList();
            assertThat(actions).doesNotContain(
                com.taskforce.tf_api.core.enums.IssueActivityType.TITLE_CHANGED);
        }

        @Test
        @DisplayName("changer le statut vers le même statut n'a aucun effet (pas de notification)")
        void same_status_no_effect() {
            IssueResponse created = issueService.createIssue(
                SLUG, project.getId(), createRequest("sameStatus", null), owner.getId());
            Long currentStatusId = created.getStatus().getId();

            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setStatusId(currentStatusId);
            issueService.updateIssue(SLUG, project.getId(), created.getId(), u, owner.getId());

            verify(notificationService, never()).notifyStatusChanged(any(), any(), any());
        }

        @Test
        @DisplayName("statut d'un autre projet est rejeté (IDOR ResourceNotFoundException)")
        void update_status_from_other_project_rejected() {
            Long id = newIssueId("idorStatus");
            Project other = projectRepository.save(Project.builder()
                .workspace(workspace).name("Other2").identifier("OT2").createdBy(owner).build());
            IssueStatus foreign = issueStatusRepository.save(IssueStatus.builder()
                .project(other).name("Foreign").category(IssueStatusCategory.STARTED).position((short) 0).build());

            UpdateIssueRequest u = new UpdateIssueRequest();
            u.setStatusId(foreign.getId());

            assertThatThrownBy(() -> issueService.updateIssue(SLUG, project.getId(), id, u, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("résolution des @mentions (addComment)")
    class Mentions {

        @Test
        @DisplayName("mention par partie locale de l'email d'un membre → notifyMentions appelé avec ce membre")
        void mention_by_local_part_resolves() {
            User bob = userRepository.save(User.builder()
                .keycloakId("kc-bob").email("bob.martin@it.dev").displayName("Bob").isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(workspace).user(bob).role(WorkspaceRole.MEMBER).build());

            Long id = newIssueId("Mentioned");
            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            req.setContent("Salut @bob.martin peux-tu regarder ?");

            issueService.addComment(SLUG, project.getId(), id, req, owner.getId());

            @SuppressWarnings("unchecked")
            org.mockito.ArgumentCaptor<List<User>> captor =
                org.mockito.ArgumentCaptor.forClass(List.class);
            verify(notificationService).notifyMentions(
                any(Issue.class), any(User.class), captor.capture(), contains("@bob.martin"));
            assertThat(captor.getValue()).extracting(User::getId).contains(bob.getId());
        }

        @Test
        @DisplayName("mention par email complet d'un membre → résolue")
        void mention_by_full_email_resolves() {
            User carol = userRepository.save(User.builder()
                .keycloakId("kc-carol").email("carol@it.dev").displayName("Carol").isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(workspace).user(carol).role(WorkspaceRole.MEMBER).build());

            Long id = newIssueId("MentionFull");
            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            req.setContent("cc @carol@it.dev");

            issueService.addComment(SLUG, project.getId(), id, req, owner.getId());

            @SuppressWarnings("unchecked")
            org.mockito.ArgumentCaptor<List<User>> captor =
                org.mockito.ArgumentCaptor.forClass(List.class);
            verify(notificationService).notifyMentions(
                any(Issue.class), any(User.class), captor.capture(), any(String.class));
            assertThat(captor.getValue()).extracting(User::getId).contains(carol.getId());
        }

        @Test
        @DisplayName("mention d'un non-membre / inconnu est ignorée (notifyMentions jamais appelé)")
        void unknown_mention_ignored() {
            // Utilisateur existant mais NON membre du workspace
            userRepository.save(User.builder()
                .keycloakId("kc-ext").email("externe@it.dev").displayName("Externe").isActive(true).build());

            Long id = newIssueId("MentionUnknown");
            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            req.setContent("Merci @externe et @inexistant");

            issueService.addComment(SLUG, project.getId(), id, req, owner.getId());

            verify(notificationService, never()).notifyMentions(any(), any(), any(), any());
        }

        @Test
        @DisplayName("commentaire sans @ ne déclenche pas notifyMentions")
        void no_at_no_mentions() {
            Long id = newIssueId("NoMention");
            var req = new com.taskforce.tf_api.core.dto.request.CreateIssueCommentRequest();
            req.setContent("Commentaire simple sans mention");

            issueService.addComment(SLUG, project.getId(), id, req, owner.getId());

            verify(notificationService, never()).notifyMentions(any(), any(), any(), any());
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("branches profondes createIssue (options)")
    class DeepCreate {

        @Test
        @DisplayName("createIssue avec statut/type/parent/dates explicites persiste tous les champs")
        void create_with_all_optional_fields() {
            Long parentId = newIssueId("Parent complet");
            Long typeId = issueService.listTypes(SLUG, project.getId(), owner.getId()).get(0).getId();

            CreateIssueRequest req = createRequest("Enfant complet", owner.getId());
            req.setStatusId(doneStatus.getId());
            req.setTypeId(typeId);
            req.setParentId(parentId);
            req.setStartDate("2026-08-01");
            req.setDueDate("2026-08-31");

            IssueResponse res = issueService.createIssue(SLUG, project.getId(), req, owner.getId());

            assertThat(res.getStatus().getName()).isEqualTo("Done");
            assertThat(res.getType().getId()).isEqualTo(typeId);
            assertThat(res.getParent().getId()).isEqualTo(parentId);
            assertThat(res.getStartDate()).isEqualTo(java.time.LocalDate.parse("2026-08-01"));
            assertThat(res.getDueDate()).isEqualTo(java.time.LocalDate.parse("2026-08-31"));
            assertThat(res.getAssignee().getId()).isEqualTo(owner.getId());
        }

        @Test
        @DisplayName("createIssue sans priorité applique la priorité NONE par défaut")
        void create_defaults_priority_none() {
            CreateIssueRequest req = new CreateIssueRequest();
            req.setTitle("Sans priorité");
            // priority laissée null

            IssueResponse res = issueService.createIssue(SLUG, project.getId(), req, owner.getId());

            assertThat(res.getPriority()).isEqualTo(IssuePriority.NONE);
        }

        @Test
        @DisplayName("createIssue avec un type d'un autre projet est rejeté (ResourceNotFoundException)")
        void create_with_foreign_type_rejected() {
            Project other = projectRepository.save(Project.builder()
                .workspace(workspace).name("Other3").identifier("OT3").createdBy(owner).build());
            issueService.seedDefaultStatusesAndTypes(other);
            Long foreignTypeId = issueService.listTypes(SLUG, other.getId(), owner.getId()).get(0).getId();

            CreateIssueRequest req = createRequest("bad type", null);
            req.setTypeId(foreignTypeId);

            assertThatThrownBy(() -> issueService.createIssue(SLUG, project.getId(), req, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("branches profondes statuts (listStatuses / updateStatus)")
    class DeepStatuses {

        @Test
        @DisplayName("listStatuses réamorce les statuts par défaut quand le projet n'en a aucun")
        void list_statuses_reseeds_when_empty() {
            Project fresh = projectRepository.save(Project.builder()
                .workspace(workspace).name("Vierge").identifier("VRG").createdBy(owner).build());
            // aucun seedDefaultStatusesAndTypes ici → doit être réamorcé par listStatuses

            var statuses = issueService.listStatuses(SLUG, fresh.getId(), owner.getId());

            assertThat(statuses).hasSize(5);
        }

        @Test
        @DisplayName("updateStatus avec isDefault=true bascule le statut par défaut (l'ancien perd le flag)")
        void update_status_changes_default() {
            var statuses = issueService.listStatuses(SLUG, project.getId(), owner.getId());
            var oldDefault = statuses.stream()
                .filter(com.taskforce.tf_api.core.dto.response.IssueStatusResponse::isDefault)
                .findFirst().orElseThrow();
            var notDefault = statuses.stream()
                .filter(s -> !s.isDefault())
                .findFirst().orElseThrow();

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateIssueStatusRequest();
            upd.setIsDefault(true);
            var res = issueService.updateStatus(SLUG, project.getId(), notDefault.getId(), upd, owner.getId());

            assertThat(res.isDefault()).isTrue();

            em.flush();
            em.clear();

            var after = issueService.listStatuses(SLUG, project.getId(), owner.getId());
            assertThat(after.stream().filter(com.taskforce.tf_api.core.dto.response.IssueStatusResponse::isDefault))
                .hasSize(1);
            assertThat(after.stream()
                .filter(s -> s.getId().equals(oldDefault.getId()))
                .findFirst().orElseThrow().isDefault()).isFalse();
        }

        @Test
        @DisplayName("updateStatus applique nom/couleur/position simultanément")
        void update_status_name_color_position() {
            var status = issueService.listStatuses(SLUG, project.getId(), owner.getId()).stream()
                .filter(s -> !s.isDefault())
                .findFirst().orElseThrow();

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateIssueStatusRequest();
            upd.setName("Renommé");
            upd.setColor("#abcdef");
            upd.setPosition((short) 9);
            var res = issueService.updateStatus(SLUG, project.getId(), status.getId(), upd, owner.getId());

            assertThat(res.getName()).isEqualTo("Renommé");
            assertThat(res.getColor()).isEqualTo("#abcdef");
            assertThat(res.getPosition()).isEqualTo((short) 9);
        }

        @Test
        @DisplayName("updateStatus d'un statut d'un autre projet est rejeté (ResourceNotFoundException)")
        void update_status_foreign_rejected() {
            Project other = projectRepository.save(Project.builder()
                .workspace(workspace).name("Other4").identifier("OT4").createdBy(owner).build());
            IssueStatus foreign = issueStatusRepository.save(IssueStatus.builder()
                .project(other).name("Etr").category(IssueStatusCategory.STARTED).position((short) 0).build());

            var upd = new com.taskforce.tf_api.core.dto.request.UpdateIssueStatusRequest();
            upd.setName("x");

            assertThatThrownBy(() -> issueService.updateStatus(
                    SLUG, project.getId(), foreign.getId(), upd, owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("visibilité projet privé (lectures d'issues)")
    class PrivateProjectIssueVisibility {

        private User wsMember(String kc) {
            User u = userRepository.save(User.builder()
                .keycloakId(kc).email(kc + "@it.dev").displayName(kc).isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(workspace).user(u).role(WorkspaceRole.MEMBER).build());
            return u;
        }

        @Test
        @DisplayName("projet privé : un membre du workspace non invité ne peut pas lister/voir les issues (404)")
        void private_issues_hidden_from_non_member() {
            Long id = newIssueId("Secret issue"); // project est privé par défaut (isPublic=false)
            User bob = wsMember("kc-vis-bob");

            assertThatThrownBy(() -> issueService.listIssues(SLUG, project.getId(), bob.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
            assertThatThrownBy(() -> issueService.getIssue(SLUG, project.getId(), id, bob.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("projet public : tout membre du workspace peut lister les issues")
        void public_issues_visible_to_member() {
            newIssueId("Open issue");
            project.setPublic(true);
            projectRepository.save(project);
            User bob = wsMember("kc-vis-pub");

            assertThat(issueService.listIssues(SLUG, project.getId(), bob.getId())).isNotEmpty();
        }

        @Test
        @DisplayName("getScheduledIssues masque les issues planifiées d'un projet privé pour un non-membre (l'ADMIN les voit)")
        void scheduled_excludes_private_for_non_member() {
            CreateIssueRequest cr = createRequest("Planned secret", null);
            cr.setDueDate("2026-10-01");
            issueService.createIssue(SLUG, project.getId(), cr, owner.getId()); // projet privé

            User bob = wsMember("kc-vis-sched");
            assertThat(issueService.getScheduledIssues(SLUG, bob.getId())).isEmpty();
            assertThat(issueService.getScheduledIssues(SLUG, owner.getId())).isNotEmpty();
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("RBAC écriture projet (TF-RBAC-WRITE)")
    class WriteRbac {

        private User wsMember(String kc, WorkspaceRole role) {
            User u = userRepository.save(User.builder()
                .keycloakId(kc).email(kc + "@it.dev").displayName(kc).isActive(true).build());
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(workspace).user(u).role(role).build());
            return u;
        }

        @Test
        @DisplayName("VIEWER de projet : lecture OK mais écriture refusée (BusinessException « lecture seule »)")
        void viewer_can_read_but_not_write() {
            User viewer = wsMember("kc-viewer", WorkspaceRole.MEMBER);
            projectMemberRepository.save(ProjectMember.builder()
                .project(project).user(viewer).role(ProjectRole.VIEWER).build());
            newIssueId("visible au viewer"); // créée par l'owner

            // Lecture : le VIEWER (membre projet) voit les issues …
            assertThat(issueService.listIssues(SLUG, project.getId(), viewer.getId())).isNotEmpty();
            // … mais ne peut pas en créer (lecture seule).
            assertThatThrownBy(() -> issueService.createIssue(
                    SLUG, project.getId(), createRequest("nope", null), viewer.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("lecture seule");
        }

        @Test
        @DisplayName("MEMBER de projet : écriture autorisée")
        void project_member_can_write() {
            User member = wsMember("kc-pmember", WorkspaceRole.MEMBER);
            projectMemberRepository.save(ProjectMember.builder()
                .project(project).user(member).role(ProjectRole.MEMBER).build());

            IssueResponse res = issueService.createIssue(
                SLUG, project.getId(), createRequest("par un membre projet", null), member.getId());
            assertThat(res.getId()).isNotNull();
        }

        @Test
        @DisplayName("projet privé : un membre du workspace non invité ne peut pas écrire (404, projet invisible)")
        void non_member_cannot_write_private() {
            User outsider = wsMember("kc-outsider", WorkspaceRole.MEMBER);

            assertThatThrownBy(() -> issueService.createIssue(
                    SLUG, project.getId(), createRequest("intrus", null), outsider.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("projet public : tout membre du workspace peut écrire (contribution ouverte)")
        void any_member_can_write_public() {
            project.setPublic(true);
            projectRepository.save(project);
            User contributor = wsMember("kc-contrib", WorkspaceRole.MEMBER);

            IssueResponse res = issueService.createIssue(
                SLUG, project.getId(), createRequest("contribution ouverte", null), contributor.getId());
            assertThat(res.getId()).isNotNull();
        }

        @Test
        @DisplayName("OWNER du workspace : écrit dans un projet privé sans en être membre (admin)")
        void workspace_owner_writes_private_without_membership() {
            // owner n'a pas de ProjectMember (cf. seed) mais est OWNER du workspace → admin.
            IssueResponse res = issueService.createIssue(
                SLUG, project.getId(), createRequest("par l'admin", null), owner.getId());
            assertThat(res.getId()).isNotNull();
        }
    }

    // =========================================================================
    @Nested
    @DisplayName("rétention d'historique par plan (UNLIMITED_HISTORY)")
    class HistoryRetention {

        @Test
        @DisplayName("sans UNLIMITED_HISTORY (FREE) : activité bornée aux N dernières ; BUSINESS voit tout")
        void activity_retention_gated_by_plan() {
            ReflectionTestUtils.setField(issueService, "historyRetentionLimit", 1);
            owner.setPlanType(com.taskforce.tf_api.core.enums.PlanType.FREE);
            userRepository.save(owner);

            Long id = newIssueId("Historique"); // 1 activité : CREATED
            UpdateIssueRequest u1 = new UpdateIssueRequest(); u1.setTitle("v2");
            issueService.updateIssue(SLUG, project.getId(), id, u1, owner.getId());
            UpdateIssueRequest u2 = new UpdateIssueRequest(); u2.setPriority(IssuePriority.URGENT);
            issueService.updateIssue(SLUG, project.getId(), id, u2, owner.getId());

            // FREE (pas d'UNLIMITED_HISTORY) → borné à la dernière entrée.
            assertThat(issueService.listActivity(SLUG, project.getId(), id, owner.getId())).hasSize(1);

            // BUSINESS → historique complet (> 1).
            owner.setPlanType(com.taskforce.tf_api.core.enums.PlanType.BUSINESS);
            userRepository.save(owner);
            assertThat(issueService.listActivity(SLUG, project.getId(), id, owner.getId())).hasSizeGreaterThan(1);
        }
    }
}
