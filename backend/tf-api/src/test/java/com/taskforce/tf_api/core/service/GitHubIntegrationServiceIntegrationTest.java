package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.request.GitHubLinkRequest;
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

/**
 * Tests d'intégration — {@link GitHubIntegrationService} (parties sans appel API réel).
 * URL OAuth, statut (déconnecté), disconnect, liens issue↔GitHub (CRUD).
 */
@DisplayName("GitHubIntegrationService (intégration Postgres)")
@Import(GitHubIntegrationService.class)
class GitHubIntegrationServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private GitHubIntegrationService service;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;

    @Autowired private com.taskforce.tf_api.core.repository.IntegrationRepository integrationRepository;
    @MockitoBean private RestTemplate restTemplate;

    private static final String SLUG = "ws-gh-it";
    private User owner;
    private Long issueId;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-gh").email("gh@it.dev").displayName("Owner").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("GH WS").slug(SLUG).owner(owner).build());
        Project project = projectRepository.save(Project.builder().workspace(ws).name("App").identifier("APP").createdBy(owner).build());
        IssueStatus status = issueStatusRepository.save(IssueStatus.builder()
            .project(project).name("Backlog").category(IssueStatusCategory.BACKLOG).build());
        issueId = issueRepository.save(Issue.builder()
            .project(project).status(status).reporter(owner).sequenceNumber(1).title("I").build()).getId();
    }

    @Test
    @DisplayName("buildAuthorizeUrl construit une URL OAuth avec le state = slug")
    void should_build_authorize_url() {
        var uri = service.buildAuthorizeUrl(SLUG);
        assertThat(uri.toString()).contains("state=" + SLUG);
    }

    @Test
    @DisplayName("getStatus = déconnecté sans intégration ; disconnect est idempotent")
    void should_report_disconnected_and_disconnect() {
        assertThat(service.getStatus(SLUG).connected()).isFalse();
        service.disconnect(SLUG); // ne lève rien
        assertThat(service.getStatus(SLUG).connected()).isFalse();
    }

    @Test
    @DisplayName("addLink / getLinks / deleteLink sur une issue")
    void should_manage_links() {
        var link = service.addLink(issueId,
            new GitHubLinkRequest("PR", "o/r", 1, "https://github.com/o/r/pull/1", null, null, "Fix"), owner);
        assertThat(service.getLinks(issueId)).hasSize(1);

        service.deleteLink(link.id());
        assertThat(service.getLinks(issueId)).isEmpty();
    }

    private void connectGitHub() {
        var ws = workspaceRepository.findBySlug(SLUG).orElseThrow();
        integrationRepository.save(com.taskforce.tf_api.core.model.Integration.builder()
            .workspace(ws)
            .provider(com.taskforce.tf_api.core.enums.IntegrationProvider.GITHUB)
            .accessToken("gho_token")
            .meta(java.util.Map.of())
            .build());
    }

    @Test
    @DisplayName("getStatus = connecté après persistance d'une intégration GitHub")
    void status_connected_when_integration_exists() {
        connectGitHub();
        assertThat(service.getStatus(SLUG).connected()).isTrue();
    }

    @Test
    @DisplayName("listRepositories mappe la réponse de l'API GitHub")
    void list_repositories() {
        connectGitHub();
        org.mockito.Mockito.doReturn(org.springframework.http.ResponseEntity.ok(java.util.List.of(
                java.util.Map.of("full_name", "org/repo", "name", "repo", "private", false,
                                 "html_url", "https://github.com/org/repo", "open_issues_count", 3))))
            .when(restTemplate).exchange(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(org.springframework.http.HttpMethod.GET),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(org.springframework.core.ParameterizedTypeReference.class));

        assertThat(service.listRepositories(SLUG)).hasSize(1);
    }

    @Test
    @DisplayName("listRepoIssues mappe les issues de l'API GitHub")
    void list_repo_issues() {
        connectGitHub();
        org.mockito.Mockito.doReturn(org.springframework.http.ResponseEntity.ok(java.util.List.of(
                java.util.Map.of("number", 7, "title", "Bug X", "state", "open",
                                 "html_url", "https://github.com/org/repo/issues/7", "updated_at", "2026-01-01"))))
            .when(restTemplate).exchange(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(org.springframework.http.HttpMethod.GET),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(org.springframework.core.ParameterizedTypeReference.class));

        assertThat(service.listRepoIssues(SLUG, "org/repo")).hasSize(1);
    }
}
