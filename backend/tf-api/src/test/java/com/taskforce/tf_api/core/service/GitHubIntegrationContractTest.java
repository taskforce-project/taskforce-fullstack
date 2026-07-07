package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.response.GitHubIssueResponse;
import com.taskforce.tf_api.core.dto.response.GitHubRepoResponse;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.OAuthState;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Contract test (wire) — {@link GitHubIntegrationService} contre l'API GitHub (OAuth + REST).
 *
 * <p>{@link MockRestServiceServer} lié au {@code RestTemplate} injecté : valide les <b>vraies requêtes HTTP</b>
 * (échange OAuth POST {@code /login/oauth/access_token} form-urlencoded, GET {@code /user} + {@code /user/repos}
 * + {@code /repos/{full}/issues} avec header {@code Authorization: Bearer <token>}) et le mapping des DTOs.</p>
 *
 * <p>La méthode privée {@code exchangeCodeForToken}/{@code fetchGitHubUser} est atteinte via l'entrée publique
 * {@code handleCallback}. Les repos sont mockés (Mockito) ; le token de lecture provient d'une {@link Integration}
 * stubbée.</p>
 */
@DisplayName("GitHubIntegrationService (contract wire API GitHub)")
class GitHubIntegrationContractTest {

    private static final String SLUG = "acme";

    private GitHubIntegrationService service;
    private MockRestServiceServer server;

    private IntegrationRepository integrationRepository;
    private IssueGitHubLinkRepository issueGitHubLinkRepository;
    private WorkspaceRepository workspaceRepository;
    private IssueRepository issueRepository;
    private OAuthStateRepository oauthStateRepository;

    private Workspace workspace;

    @BeforeEach
    void setUp() {
        integrationRepository     = Mockito.mock(IntegrationRepository.class);
        issueGitHubLinkRepository = Mockito.mock(IssueGitHubLinkRepository.class);
        workspaceRepository       = Mockito.mock(WorkspaceRepository.class);
        issueRepository           = Mockito.mock(IssueRepository.class);
        oauthStateRepository      = Mockito.mock(OAuthStateRepository.class);
        RestTemplate rt = new RestTemplate();

        // Ordre du constructeur généré par @RequiredArgsConstructor = ordre de déclaration des champs final :
        // integrationRepository, issueGitHubLinkRepository, workspaceRepository, issueRepository, oauthStateRepository, restTemplate
        service = new GitHubIntegrationService(
            integrationRepository,
            issueGitHubLinkRepository,
            workspaceRepository,
            issueRepository,
            oauthStateRepository,
            rt
        );

        ReflectionTestUtils.setField(service, "clientId", "cid");
        ReflectionTestUtils.setField(service, "clientSecret", "secret");
        ReflectionTestUtils.setField(service, "frontendUrl", "http://localhost:3000");
        ReflectionTestUtils.setField(service, "appUrl", "http://localhost:8080");

        workspace = Workspace.builder().id(1L).name("Acme").slug(SLUG).build();

        server = MockRestServiceServer.createServer(rt);
    }

    @Test
    @DisplayName("handleCallback : POST token (form-urlencoded) puis GET /user (Bearer) → redirect github=connected")
    void handleCallback_echange_le_code_et_recupere_user() {
        // Le workspace est résolu via le state OAuth (pas via le slug de l'URL)
        OAuthState state = OAuthState.builder()
            .state("the-state").provider(IntegrationProvider.GITHUB)
            .workspace(workspace).expiresAt(java.time.LocalDateTime.now().plusMinutes(5)).build();
        Mockito.when(oauthStateRepository.findById("the-state")).thenReturn(Optional.of(state));
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(1L, IntegrationProvider.GITHUB))
            .thenReturn(Optional.empty());

        server.expect(requestTo("https://github.com/login/oauth/access_token"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
            .andRespond(withSuccess("{\"access_token\":\"gho_x\"}", MediaType.APPLICATION_JSON));

        server.expect(requestTo("https://api.github.com/user"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer gho_x"))
            .andRespond(withSuccess(
                "{\"login\":\"octocat\",\"avatar_url\":\"https://gh/av.png\"}",
                MediaType.APPLICATION_JSON));

        String redirect = service.handleCallback("the-code", "the-state");

        assertThat(redirect).contains("github=connected");
        server.verify();
    }

    @Test
    @DisplayName("listRepositories : GET /user/repos (Bearer) → mappe la liste de dépôts")
    void listRepositories_get_et_mappe() {
        Mockito.when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
        Integration integration = Integration.builder()
            .workspace(workspace)
            .provider(IntegrationProvider.GITHUB)
            .accessToken("gho_token")
            .meta(Map.of())
            .build();
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(1L, IntegrationProvider.GITHUB))
            .thenReturn(Optional.of(integration));

        server.expect(requestTo("https://api.github.com/user/repos?per_page=100&sort=updated"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer gho_token"))
            .andRespond(withSuccess(
                "[{\"full_name\":\"octocat/hello\",\"name\":\"hello\",\"private\":false,"
                    + "\"html_url\":\"https://github.com/octocat/hello\",\"open_issues_count\":3}]",
                MediaType.APPLICATION_JSON));

        List<GitHubRepoResponse> repos = service.listRepositories(SLUG);

        assertThat(repos).hasSize(1);
        assertThat(repos.get(0).fullName()).isEqualTo("octocat/hello");
        assertThat(repos.get(0).openIssues()).isEqualTo(3);
        server.verify();
    }

    @Test
    @DisplayName("listRepoIssues : GET /repos/{full}/issues (Bearer) → mappe issues et PR")
    void listRepoIssues_get_et_mappe() {
        Mockito.when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
        Integration integration = Integration.builder()
            .workspace(workspace)
            .provider(IntegrationProvider.GITHUB)
            .accessToken("gho_token")
            .meta(Map.of())
            .build();
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(1L, IntegrationProvider.GITHUB))
            .thenReturn(Optional.of(integration));

        server.expect(requestTo(
                "https://api.github.com/repos/octocat/hello/issues?state=all&per_page=50&sort=updated"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer gho_token"))
            .andRespond(withSuccess(
                "[{\"number\":42,\"title\":\"Bug\",\"state\":\"open\","
                    + "\"html_url\":\"https://github.com/octocat/hello/issues/42\","
                    + "\"user\":{\"login\":\"octocat\"},\"updated_at\":\"2026-01-01T00:00:00Z\"}]",
                MediaType.APPLICATION_JSON));

        List<GitHubIssueResponse> issues = service.listRepoIssues(SLUG, "octocat/hello");

        assertThat(issues).hasSize(1);
        assertThat(issues.get(0).number()).isEqualTo(42);
        assertThat(issues.get(0).author()).isEqualTo("octocat");
        assertThat(issues.get(0).pullRequest()).isFalse();
        server.verify();
    }
}
