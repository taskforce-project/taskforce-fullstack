package com.taskforce.tf_api.modules.ged.service;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.ProjectMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.modules.ged.domain.Attachment;
import com.taskforce.tf_api.modules.ged.dto.response.IssueAttachmentCount;
import com.taskforce.tf_api.modules.ged.repository.AttachmentRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;

/**
 * Tests d'intégration — {@link AttachmentService} (pièces jointes MinIO). Repos réels,
 * {@code ObjectStorage} mocké.
 *
 * <p>Couvre le nominal, et surtout la <b>non-régression de l'IDOR</b> : le service ne vérifiait
 * que le rattachement de l'issue au projet/workspace de l'URL, jamais <b>qui</b> demandait. Tout
 * compte authentifié pouvait donc lister et télécharger les pièces jointes de n'importe quel
 * workspace en devinant un id d'issue — et l'URL présignée renvoyée ne demande plus aucune
 * authentification pendant une heure. Voir {@link AccessControl}.</p>
 */
@DisplayName("AttachmentService (intégration Postgres)")
@Import({AttachmentService.class, ProjectVisibilityGuard.class})
class AttachmentServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private AttachmentService attachmentService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private ProjectMemberRepository projectMemberRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private AttachmentRepository attachmentRepository;

    @MockitoBean private ObjectStorage objectStorage;
    @MockitoBean private com.taskforce.tf_api.core.service.ProjectTopic topic;

    private static final String SLUG = "ws-att-it";
    private User owner;
    private Project project;
    private Long issueId;

    @BeforeEach
    void seed() {
        owner = newUser("kc-att", "att@it.dev", "Owner");
        Workspace ws = newWorkspace("Att WS", SLUG, owner);
        project = projectRepository.save(Project.builder()
            .workspace(ws).name("App").identifier("APP").createdBy(owner).build());
        IssueStatus status = issueStatusRepository.save(IssueStatus.builder()
            .project(project).name("Backlog").category(IssueStatusCategory.BACKLOG).build());
        Issue issue = issueRepository.save(Issue.builder()
            .project(project).status(status).reporter(owner).sequenceNumber(1).title("I").build());
        issueId = issue.getId();
    }

    private User newUser(String kcId, String email, String name) {
        return userRepository.save(User.builder()
            .keycloakId(kcId).email(email).displayName(name).isActive(true).build());
    }

    /**
     * Un workspace vient toujours avec la ligne {@link WorkspaceMember} de son owner : c'est ce que
     * fait {@code WorkspaceService} en production, et c'est ce qui rend l'owner OWNER aux yeux de
     * {@link ProjectVisibilityGuard} — les projets sont privés par défaut.
     */
    private Workspace newWorkspace(String name, String slug, User wsOwner) {
        Workspace ws = workspaceRepository.save(Workspace.builder()
            .name(name).slug(slug).owner(wsOwner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder()
            .workspace(ws).user(wsOwner).role(WorkspaceRole.OWNER).build());
        return ws;
    }

    private MockMultipartFile file() {
        return new MockMultipartFile("file", "capture.png", "image/png", "binarydata".getBytes());
    }

    @Test
    @DisplayName("upload persiste la pièce jointe et pousse vers MinIO ; listByIssue la voit")
    void should_upload_and_list() throws Exception {
        attachmentService.upload(SLUG, project.getId(), issueId, file(), owner.getId());

        assertThat(attachmentService.listByIssue(SLUG, project.getId(), issueId, owner.getId())).hasSize(1);
        verify(objectStorage).upload(anyString(), any(), anyLong(), anyString());
    }

    @Test
    @DisplayName("upload d'un fichier vide → IllegalArgumentException")
    void should_reject_empty_file() {
        MockMultipartFile empty = new MockMultipartFile("file", "e.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> attachmentService.upload(SLUG, project.getId(), issueId, empty, owner.getId()))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("delete retire la pièce jointe")
    void should_delete() throws Exception {
        attachmentService.upload(SLUG, project.getId(), issueId, file(), owner.getId());
        Long attId = attachmentService.listByIssue(SLUG, project.getId(), issueId, owner.getId()).get(0).getId();

        attachmentService.delete(SLUG, project.getId(), issueId, attId, owner.getId());

        assertThat(attachmentService.listByIssue(SLUG, project.getId(), issueId, owner.getId())).isEmpty();
        // L'ajout puis le retrait s'annoncent sur le topic du projet : la vue du workflow relit ses nombres (R159, L7).
        verify(topic, org.mockito.Mockito.times(2)).announce("attachments.changed", project.getId(), issueId);
    }

    /**
     * Non-régression de l'IDOR : c'est l'identité de l'appelant qui décide, pas seulement la
     * cohérence de l'URL.
     */
    @Nested
    @DisplayName("Contrôle d'accès (IDOR)")
    class AccessControl {

        /** Un compte d'un AUTRE workspace : authentifié, mais étranger au projet. */
        private User outsider() {
            User stranger = newUser("kc-att-out", "outsider@it.dev", "Outsider");
            newWorkspace("Other WS", "ws-att-other", stranger);
            return stranger;
        }

        @Test
        @DisplayName("un non-membre ne peut pas lister — 404, l'existence du projet n'est pas révélée")
        void non_member_cannot_list() {
            assertThatThrownBy(() ->
                attachmentService.listByIssue(SLUG, project.getId(), issueId, outsider().getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("un non-membre ne peut pas uploader — 404 également")
        void non_member_cannot_upload() {
            User stranger = outsider();

            assertThatThrownBy(() ->
                attachmentService.upload(SLUG, project.getId(), issueId, file(), stranger.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("un membre du projet peut lister")
        void project_member_can_list() {
            User contributor = newUser("kc-att-mem", "member@it.dev", "Member");
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(project.getWorkspace()).user(contributor).role(WorkspaceRole.MEMBER).build());
            projectMemberRepository.save(ProjectMember.builder()
                .project(project).user(contributor).role(ProjectRole.MEMBER).build());

            assertThat(attachmentService.listByIssue(SLUG, project.getId(), issueId, contributor.getId()))
                .isEmpty();
        }

        @Test
        @DisplayName("un VIEWER voit les pièces jointes mais ne peut pas en déposer (lecture seule)")
        void viewer_can_list_but_cannot_upload() {
            User viewer = newUser("kc-att-view", "viewer@it.dev", "Viewer");
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(project.getWorkspace()).user(viewer).role(WorkspaceRole.MEMBER).build());
            projectMemberRepository.save(ProjectMember.builder()
                .project(project).user(viewer).role(ProjectRole.VIEWER).build());

            // Lecture autorisée…
            assertThat(attachmentService.listByIssue(SLUG, project.getId(), issueId, viewer.getId())).isEmpty();

            // …écriture refusée : le projet est visible, donc BusinessException (403) et non 404.
            assertThatThrownBy(() ->
                attachmentService.upload(SLUG, project.getId(), issueId, file(), viewer.getId()))
                .isInstanceOf(BusinessException.class);
        }
    }

    /**
     * Le nombre de pièces jointes de chaque issue du projet (la vue du workflow, lot W1) : une requête groupée par issue,
     * contre le vrai schéma, et gardée comme la liste d'une issue.
     */
    @Nested
    @DisplayName("Compte par issue d'un projet")
    class Counts {

        private Issue issue(int number, String title, boolean archived) {
            IssueStatus status = issueStatusRepository.findAll().stream()
                .filter(s -> s.getProject().getId().equals(project.getId())).findFirst().orElseThrow();
            return issueRepository.save(Issue.builder().project(project).status(status).reporter(owner)
                .sequenceNumber(number).title(title).archivedAt(archived ? LocalDateTime.now() : null).build());
        }

        private void attach(Long issue, String name) {
            attachmentRepository.save(Attachment.builder().issue(issueRepository.getReferenceById(issue)).uploadedBy(owner)
                .originalName(name).storedKey("issues/" + issue + "/" + name).contentType("text/plain").fileSize(4L).build());
        }

        @Test
        @DisplayName("une ligne par issue qui a des pièces jointes, dans l'ordre des issues ; ni les issues sans pièce jointe, ni les archivées")
        void groups_by_issue_without_the_archived_ones() {
            Long second = issue(2, "Second", false).getId();
            Long empty = issue(3, "Without files", false).getId();
            Long archived = issue(4, "Archived", true).getId();
            attach(issueId, "a.txt");
            attach(issueId, "b.txt");
            attach(second, "c.txt");
            attach(archived, "d.txt");

            List<IssueAttachmentCount> counts = attachmentService.countByIssue(SLUG, project.getId(), owner.getId());

            assertThat(counts).containsExactly(new IssueAttachmentCount(issueId, 2), new IssueAttachmentCount(second, 1));
            assertThat(counts).extracting(IssueAttachmentCount::issueId).doesNotContain(empty, archived);
        }

        @Test
        @DisplayName("les pièces jointes d'un autre projet ne comptent pas")
        void counts_only_the_project() {
            Project other = projectRepository.save(Project.builder()
                .workspace(project.getWorkspace()).name("Other").identifier("OTH").createdBy(owner).build());
            IssueStatus status = issueStatusRepository.save(IssueStatus.builder()
                .project(other).name("Backlog").category(IssueStatusCategory.BACKLOG).build());
            Issue elsewhere = issueRepository.save(Issue.builder()
                .project(other).status(status).reporter(owner).sequenceNumber(1).title("Elsewhere").build());
            attach(elsewhere.getId(), "x.txt");
            attach(issueId, "a.txt");

            assertThat(attachmentService.countByIssue(SLUG, project.getId(), owner.getId()))
                .containsExactly(new IssueAttachmentCount(issueId, 1));
            assertThat(attachmentService.countByIssue(SLUG, other.getId(), owner.getId()))
                .containsExactly(new IssueAttachmentCount(elsewhere.getId(), 1));
        }

        @Test
        @DisplayName("un projet sans pièce jointe rend une liste vide")
        void empty_without_attachments() {
            assertThat(attachmentService.countByIssue(SLUG, project.getId(), owner.getId())).isEmpty();
        }

        @Test
        @DisplayName("quelqu'un qui n'est pas membre de l'espace est refusé (403), avant toute lecture")
        void a_non_member_of_the_workspace_is_refused() {
            User stranger = userRepository.save(User.builder()
                .keycloakId("kc-att-cnt-out").email("count-outsider@it.dev").displayName("Outsider").isActive(true).build());

            assertThatThrownBy(() -> attachmentService.countByIssue(SLUG, project.getId(), stranger.getId()))
                .isInstanceOf(ForbiddenException.class);
        }

        @Test
        @DisplayName("un membre de l'espace qui ne voit pas le projet privé reçoit 404 ; un membre du projet lit le compte")
        void a_private_project_stays_hidden() {
            User colleague = newUser("kc-att-cnt-mem", "count-member@it.dev", "Colleague");
            workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspace(project.getWorkspace()).user(colleague).role(WorkspaceRole.MEMBER).build());
            attach(issueId, "a.txt");

            assertThatThrownBy(() -> attachmentService.countByIssue(SLUG, project.getId(), colleague.getId()))
                .isInstanceOf(ResourceNotFoundException.class);

            projectMemberRepository.save(ProjectMember.builder()
                .project(project).user(colleague).role(ProjectRole.VIEWER).build());
            assertThat(attachmentService.countByIssue(SLUG, project.getId(), colleague.getId()))
                .containsExactly(new IssueAttachmentCount(issueId, 1));
        }

        @Test
        @DisplayName("le projet d'un autre espace, appelé par le chemin de cet espace, répond 404")
        void a_project_of_another_workspace_is_not_found() {
            User stranger = newUser("kc-att-cnt-oth", "count-other@it.dev", "Other owner");
            Workspace otherWs = newWorkspace("Other WS", "ws-att-cnt-other", stranger);
            Project foreign = projectRepository.save(Project.builder()
                .workspace(otherWs).name("Foreign").identifier("FOR").createdBy(stranger).isPublic(true).build());

            assertThatThrownBy(() -> attachmentService.countByIssue(SLUG, foreign.getId(), owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
            assertThatThrownBy(() -> attachmentService.countByIssue("no-such-workspace", project.getId(), owner.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        }
    }
}
