package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueCommentHitResponse;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueComment;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueCommentRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * La recherche dans les commentaires (Ctrl+K, R141) contre un vrai Postgres : par les mots, en préfixe, jamais sous une
 * issue archivée, ni dans un projet privé que la personne ne voit pas, ni dans un autre espace.
 */
@DisplayName("IssueCommentSearchService (intégration Postgres)")
@Import({IssueCommentSearchService.class, IssueService.class, ProjectVisibilityGuard.class})
class IssueCommentSearchIntegrationTest extends AbstractIntegrationTest {

    @Autowired private IssueCommentSearchService service;
    @Autowired private IssueService issueService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private IssueCommentRepository commentRepository;

    @MockitoBean private SimpMessagingTemplate messagingTemplate;
    @MockitoBean private NotificationService notificationService;
    @MockitoBean private SlackIntegrationService slackService;

    private static final String SLUG = "ws-comment-search-it";

    private User owner;
    private User member;
    private Workspace workspace;
    private Project ops;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-comment-owner").email("owner@comment.it").displayName("Owner").isActive(true).build());
        member = userRepository.save(User.builder()
            .keycloakId("kc-comment-member").email("member@comment.it").displayName("Member").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Comment WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(owner).role(WorkspaceRole.OWNER).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(member).role(WorkspaceRole.MEMBER).build());
        ops = project(workspace, SLUG, "Operations", "OPS", true);
    }

    private Project project(Workspace in, String slug, String name, String identifier, boolean open) {
        Project project = projectRepository.save(Project.builder()
            .workspace(in).name(name).identifier(identifier).isPublic(open).createdBy(owner).build());
        issueService.seedDefaultStatusesAndTypes(project);
        return project;
    }

    private Long issue(String slug, Project project, String title) {
        CreateIssueRequest request = new CreateIssueRequest();
        request.setTitle(title);
        return issueService.createIssue(slug, project.getId(), request, owner.getId()).getId();
    }

    private void comment(Long issueId, String content) {
        Issue issue = issueRepository.findById(issueId).orElseThrow();
        commentRepository.save(IssueComment.builder().issue(issue).author(owner).content(content).build());
    }

    private List<String> keys(User reader, String query) {
        return service.search(SLUG, reader.getId(), query, 20).stream().map(IssueCommentHitResponse::key).toList();
    }

    @ParameterizedTest(name = "« {0} »")
    @CsvSource({
        "deployment",
        "DEPLOY",
        "failed deployment",
        "roll deploy",
    })
    @DisplayName("trouve par les mots, dans n'importe quel ordre, en préfixe, sans la casse")
    void finds_by_words(String query) {
        comment(issue(SLUG, ops, "Quiet title"), "The rollout: the deployment **failed** on Monday.");

        assertThat(keys(owner, query)).containsExactly("OPS-1");
    }

    @Test
    @DisplayName("chaque mot doit y être, et le passage est en texte brut")
    void every_word_counts() {
        comment(issue(SLUG, ops, "Quiet title"), "The **deployment** failed on Monday.");

        assertThat(keys(owner, "deployment tuesday")).isEmpty();
        assertThat(service.search(SLUG, owner.getId(), "deployment", 5)).extracting(IssueCommentHitResponse::excerpt)
            .containsExactly("The deployment failed on Monday.");
    }

    @Test
    @DisplayName("le texte de la recherche ne casse jamais la requête")
    void symbols_do_not_break_the_query() {
        comment(issue(SLUG, ops, "Quiet title"), "A word");

        assertThat(keys(owner, "word & | ! ' : *")).containsExactly("OPS-1");
        assertThat(keys(owner, "!!! ' :")).isEmpty();
    }

    @Test
    @DisplayName("une ligne par issue, le commentaire le plus récent d'abord")
    void one_row_per_issue() {
        Long first = issue(SLUG, ops, "First");
        Long second = issue(SLUG, ops, "Second");
        comment(first, "needle one");
        comment(second, "needle two");
        comment(first, "needle three");

        assertThat(service.search(SLUG, owner.getId(), "needle", 5)).extracting(IssueCommentHitResponse::excerpt)
            .containsExactly("needle three", "needle two");
    }

    @Test
    @DisplayName("jamais sous une issue archivée")
    void not_under_an_archived_issue() {
        Long id = issue(SLUG, ops, "Archived");
        comment(id, "needle");
        Issue archived = issueRepository.findById(id).orElseThrow();
        archived.setArchivedAt(LocalDateTime.now());
        issueRepository.save(archived);

        assertThat(keys(owner, "needle")).isEmpty();
    }

    @Test
    @DisplayName("un projet privé ne se lit que par ceux qui le voient")
    void private_project_stays_private() {
        Project secret = project(workspace, SLUG, "Secret", "SEC", false);
        comment(issue(SLUG, secret, "Hidden"), "needle");

        assertThat(keys(owner, "needle")).containsExactly("SEC-1");
        assertThat(keys(member, "needle")).isEmpty();
    }

    @Test
    @DisplayName("un autre espace ne répond jamais")
    void other_workspace_stays_out() {
        Workspace other = workspaceRepository.save(Workspace.builder().name("Other").slug("ws-other-it").owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(other).user(owner).role(WorkspaceRole.OWNER).build());
        Project elsewhere = project(other, "ws-other-it", "Elsewhere", "ELS", true);
        comment(issue("ws-other-it", elsewhere, "Elsewhere"), "needle");

        assertThat(keys(owner, "needle")).isEmpty();
    }
}
