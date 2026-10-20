package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestTemplate;


import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkType;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueGitHubLink;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import com.taskforce.tf_api.util.AbstractIntegrationTest;
import com.taskforce.tf_api.util.TransactionTemplateTestConfig;

/**
 * Tests d'intégration — relecture périodique des pull requests liées (app desktop, {@code DesktopPullRequestWatch}) : le
 * jeton est celui de la personne, les PR ouvertes les moins récemment relues passent d'abord, une PR fusionnée termine
 * son ticket et n'est plus relue.
 */
@DisplayName("GitHubIntegrationService : relecture des pull requests ouvertes (intégration Postgres)")
@Import({GitHubIntegrationService.class, ProjectVisibilityGuard.class, TransactionTemplateTestConfig.class})
class GitHubPullRequestSweepIntegrationTest extends AbstractIntegrationTest {

    @Autowired private GitHubIntegrationService service;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private ProjectRepository projectRepository;
    @Autowired private IssueStatusRepository issueStatusRepository;
    @Autowired private IssueRepository issueRepository;
    @Autowired private IssueGitHubLinkRepository linkRepository;

    @MockitoBean private RestTemplate restTemplate;
    @MockitoBean private GitHubTokenSource tokens;
    @MockitoBean private MergedPullRequests mergedPullRequests;
    @MockitoBean private KnowledgeService knowledgeService;
    @MockitoBean private BrainSearchService brainSearch;

    private User owner;
    private Issue issue;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder().keycloakId("kc-sweep").email("sweep@it.dev").displayName("Owner")
            .isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("Sweep").slug("ws-sweep").owner(owner).build());
        Project project = projectRepository.save(Project.builder().workspace(ws).name("App").identifier("APP")
            .createdBy(owner).build());
        IssueStatus status = issueStatusRepository.save(IssueStatus.builder().project(project).name("Todo")
            .category(IssueStatusCategory.UNSTARTED).build());
        issue = issueRepository.save(Issue.builder().project(project).status(status).reporter(owner).sequenceNumber(1)
            .title("Fix login").build());
        when(tokens.token(any())).thenReturn(Optional.of("gho_person"));
    }

    private IssueGitHubLink link(int number, GitHubLinkStatus status, LocalDateTime checkedAt) {
        return linkRepository.save(IssueGitHubLink.builder().issue(issue).linkType(GitHubLinkType.PR).repoFullName("o/r")
            .prNumber(number).status(status).statusCheckedAt(checkedAt).linkedBy(owner).build());
    }

    @SuppressWarnings("unchecked")
    private void github(int number, Map<String, Object> pullRequest) {
        doReturn(ResponseEntity.ok(pullRequest)).when(restTemplate).exchange(
            eq("https://api.github.com/repos/o/r/pulls/" + number), eq(HttpMethod.GET), any(),
            any(ParameterizedTypeReference.class));
    }

    @Test
    @DisplayName("une PR fusionnée sur GitHub termine son ticket ; les autres gardent leur statut relu")
    void a_merged_pull_request_completes_its_issue() {
        link(1, GitHubLinkStatus.OPEN, null);
        link(2, GitHubLinkStatus.OPEN, LocalDateTime.now().minusHours(1));
        github(1, Map.of("state", "closed", "merged", true, "title", "Fix login"));
        github(2, Map.of("state", "open", "title", "Draft"));

        service.refreshOpenPullRequests(10);

        verify(mergedPullRequests).completeIssue(issue.getId(), owner.getId());
        linkRepository.flush();
        assertThat(linkRepository.findByIssueIdOrderByLinkedAtDesc(issue.getId()))
            .extracting(l -> l.getPrNumber() + ":" + l.getStatus())
            .containsExactlyInAnyOrder("1:MERGED", "2:OPEN");
    }

    @Test
    @DisplayName("une PR déjà fusionnée n'est plus relue, et la moins récemment relue passe d'abord")
    void merged_ones_are_never_read_again() {
        link(3, GitHubLinkStatus.MERGED, null);
        link(4, GitHubLinkStatus.OPEN, LocalDateTime.now().minusHours(2));
        link(5, GitHubLinkStatus.OPEN, LocalDateTime.now().minusHours(1));
        github(4, Map.of("state", "open"));
        github(5, Map.of("state", "open"));

        service.refreshOpenPullRequests(1);

        verify(restTemplate).exchange(eq("https://api.github.com/repos/o/r/pulls/4"), eq(HttpMethod.GET), any(),
            any(ParameterizedTypeReference.class));
        verify(restTemplate, never()).exchange(eq("https://api.github.com/repos/o/r/pulls/3"), eq(HttpMethod.GET), any(),
            any(ParameterizedTypeReference.class));
        verify(restTemplate, never()).exchange(eq("https://api.github.com/repos/o/r/pulls/5"), eq(HttpMethod.GET), any(),
            any(ParameterizedTypeReference.class));
        verify(mergedPullRequests, never()).completeIssue(any(), any());
    }

    @Test
    @DisplayName("sans compte GitHub connecté, rien n'est relu")
    void nothing_without_a_github_account() {
        when(tokens.token(any())).thenReturn(Optional.empty());
        link(6, GitHubLinkStatus.OPEN, null);

        assertThat(service.refreshOpenPullRequests(10)).isZero();
        verify(restTemplate, never()).exchange(anyString(), any(HttpMethod.class), any(),
            any(ParameterizedTypeReference.class));
    }
}
