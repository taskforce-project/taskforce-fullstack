package com.taskforce.tf_api.modules.ged.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;

/**
 * Tests d'intégration — {@link AttachmentService} (pièces jointes MinIO). Repos réels, {@code MinioService} mocké.
 */
@DisplayName("AttachmentService (intégration Postgres)")
@Import(AttachmentService.class)
class AttachmentServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private AttachmentService attachmentService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;

    @MockitoBean private MinioService minioService;

    private static final String SLUG = "ws-att-it";
    private User owner;
    private Project project;
    private Long issueId;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-att").email("att@it.dev").displayName("Owner").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("Att WS").slug(SLUG).owner(owner).build());
        project = projectRepository.save(Project.builder().workspace(ws).name("App").identifier("APP").createdBy(owner).build());
        IssueStatus status = issueStatusRepository.save(IssueStatus.builder()
            .project(project).name("Backlog").category(IssueStatusCategory.BACKLOG).build());
        Issue issue = issueRepository.save(Issue.builder()
            .project(project).status(status).reporter(owner).sequenceNumber(1).title("I").build());
        issueId = issue.getId();
    }

    private MockMultipartFile file() {
        return new MockMultipartFile("file", "capture.png", "image/png", "binarydata".getBytes());
    }

    @Test
    @DisplayName("upload persiste la pièce jointe et pousse vers MinIO ; listByIssue la voit")
    void should_upload_and_list() throws Exception {
        attachmentService.upload(SLUG, project.getId(), issueId, file(), owner.getId());

        assertThat(attachmentService.listByIssue(SLUG, project.getId(), issueId)).hasSize(1);
        verify(minioService).upload(anyString(), any(), anyLong(), anyString());
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
        Long attId = attachmentService.listByIssue(SLUG, project.getId(), issueId).get(0).getId();

        attachmentService.delete(SLUG, project.getId(), issueId, attId, owner.getId());

        assertThat(attachmentService.listByIssue(SLUG, project.getId(), issueId)).isEmpty();
    }
}
