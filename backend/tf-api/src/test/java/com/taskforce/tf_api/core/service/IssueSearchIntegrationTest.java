package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueHitResponse;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * La recherche d'issues de la fenêtre (Ctrl+K, le « @ » et le « + » du compositeur ; R123, R124) contre un vrai Postgres :
 * par la clé, entière ou en partie, la clé exacte d'abord ; par le titre, jokers compris ; jamais une archivée, ni une
 * issue d'un projet privé que la personne ne voit pas, ni d'un autre espace.
 */
@DisplayName("IssueService.searchIssues (intégration Postgres)")
@Import({IssueService.class, ProjectVisibilityGuard.class})
class IssueSearchIntegrationTest extends AbstractIntegrationTest {

    @Autowired private IssueService issueService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueRepository issueRepository;

    @MockitoBean private SimpMessagingTemplate messagingTemplate;
    @MockitoBean private NotificationService notificationService;
    @MockitoBean private SlackIntegrationService slackService;

    private static final String SLUG = "ws-search-it";

    private User owner;
    private User member;
    private Workspace workspace;
    private Project ops;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-search-owner").email("owner@search.it").displayName("Owner").isActive(true).build());
        member = userRepository.save(User.builder()
            .keycloakId("kc-search-member").email("member@search.it").displayName("Member").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Search WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(owner).role(WorkspaceRole.OWNER).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(member).role(WorkspaceRole.MEMBER).build());
        ops = project("Operations", "OPS", true);
    }

    private Project project(String name, String identifier, boolean open) {
        Project project = projectRepository.save(Project.builder()
            .workspace(workspace).name(name).identifier(identifier).isPublic(open).createdBy(owner).build());
        issueService.seedDefaultStatusesAndTypes(project);
        return project;
    }

    private Long issue(Project project, String title) {
        CreateIssueRequest request = new CreateIssueRequest();
        request.setTitle(title);
        return issueService.createIssue(SLUG, project.getId(), request, owner.getId()).getId();
    }

    private List<String> keys(String query) {
        return issueService.searchIssues(SLUG, owner.getId(), query, 20).stream().map(IssueHitResponse::key).toList();
    }

    @Test
    @DisplayName("par la clé : exacte d'abord, avec un tiret ou une espace, et en partie pendant qu'on la tape")
    void finds_by_key() {
        for (int i = 1; i <= 12; i++) issue(ops, "Iteration #" + i);

        assertThat(keys("OPS-3")).first().isEqualTo("OPS-3");
        assertThat(keys("ops 12")).first().isEqualTo("OPS-12");
        // « OPS-1 » : OPS-1 d'abord, puis OPS-10, 11 et 12, qui commencent pareil.
        assertThat(keys("OPS-1")).startsWith("OPS-1").contains("OPS-10", "OPS-11", "OPS-12").hasSize(4);
        // Le préfixe seul : les issues du projet.
        assertThat(keys("ops")).hasSize(12);
    }

    @Test
    @DisplayName("par le titre, sans la casse ; un joker tapé se cherche tel quel")
    void finds_by_title() {
        issue(ops, "Fix the login page");
        issue(ops, "Write the release notes");
        issue(ops, "Reach 100% coverage");

        assertThat(keys("LOGIN")).containsExactly("OPS-1");
        assertThat(keys("the")).containsExactlyInAnyOrder("OPS-1", "OPS-2");
        assertThat(keys("100%")).containsExactly("OPS-3");
        assertThat(keys("%")).containsExactly("OPS-3");
        assertThat(keys("nothing like this")).isEmpty();
    }

    @Test
    @DisplayName("sans texte : les dernières changées d'abord ; jamais une archivée")
    void without_text_the_latest_first_and_never_archived() {
        Long first = issue(ops, "First");
        Long second = issue(ops, "Second");
        Long archived = issue(ops, "Archived");
        Issue gone = issueRepository.findById(archived).orElseThrow();
        gone.setArchivedAt(LocalDateTime.now());
        issueRepository.saveAndFlush(gone);

        List<IssueHitResponse> hits = issueService.searchIssues(SLUG, owner.getId(), "  ", 20);

        assertThat(hits).extracting(IssueHitResponse::id).doesNotContain(archived).contains(first, second);
        assertThat(hits.get(hits.size() - 1).id()).isEqualTo(first);
        assertThat(hits.get(0).status()).isNotBlank();
        assertThat(hits.get(0).projectId()).isEqualTo(ops.getId());
        assertThat(keys("Archived")).isEmpty();
    }

    @Test
    @DisplayName("un projet privé n'est cherché que par qui le voit ; la limite tient")
    void a_private_project_stays_private() {
        Project secret = project("Secret", "SEC", false);
        issue(secret, "Hidden plan");
        for (int i = 0; i < 4; i++) issue(ops, "Plan " + i);

        assertThat(issueService.searchIssues(SLUG, member.getId(), "plan", 20)).extracting(IssueHitResponse::key)
            .doesNotContain("SEC-1").hasSize(4);
        // Le propriétaire de l'espace voit tout.
        assertThat(keys("plan")).contains("SEC-1");
        assertThat(issueService.searchIssues(SLUG, owner.getId(), "plan", 2)).hasSize(2);
        assertThat(issueService.searchIssues(SLUG, owner.getId(), "plan", 500)).hasSize(5);
    }

    @Test
    @DisplayName("hors de l'espace : refusé")
    void outsiders_are_refused() {
        User stranger = userRepository.save(User.builder()
            .keycloakId("kc-search-stranger").email("stranger@search.it").displayName("Stranger").isActive(true).build());

        assertThatThrownBy(() -> issueService.searchIssues(SLUG, stranger.getId(), "OPS", 8))
            .isInstanceOf(BusinessException.class);
    }
}
