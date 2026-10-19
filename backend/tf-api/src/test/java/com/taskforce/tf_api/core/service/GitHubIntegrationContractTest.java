package com.taskforce.tf_api.core.service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.GitHubIssueResponse;
import com.taskforce.tf_api.core.dto.response.GitHubRepoResponse;
import com.taskforce.tf_api.core.dto.response.GitHubSyncResponse;
import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkType;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueGitHubLink;
import com.taskforce.tf_api.core.model.OAuthState;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withResourceNotFound;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withUnauthorizedRequest;

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
    private ProjectVisibilityGuard visibilityGuard;
    private KnowledgeService knowledgeService;
    private KnowledgeNodeRepository nodeRepository;
    private BrainSearchService brainSearch;
    private JdbcTemplate jdbcTemplate;

    private Workspace workspace;

    @BeforeEach
    void setUp() {
        integrationRepository     = Mockito.mock(IntegrationRepository.class);
        issueGitHubLinkRepository = Mockito.mock(IssueGitHubLinkRepository.class);
        workspaceRepository       = Mockito.mock(WorkspaceRepository.class);
        issueRepository           = Mockito.mock(IssueRepository.class);
        oauthStateRepository      = Mockito.mock(OAuthStateRepository.class);
        visibilityGuard           = Mockito.mock(ProjectVisibilityGuard.class);
        knowledgeService          = Mockito.mock(KnowledgeService.class);
        nodeRepository            = Mockito.mock(KnowledgeNodeRepository.class);
        brainSearch               = Mockito.mock(BrainSearchService.class);
        jdbcTemplate              = Mockito.mock(JdbcTemplate.class);
        RestTemplate rt = new RestTemplate();

        // Ordre du constructeur généré par @RequiredArgsConstructor = ordre de déclaration des champs final :
        // integrationRepository, issueGitHubLinkRepository, workspaceRepository, issueRepository,
        // oauthStateRepository, restTemplate, visibilityGuard, knowledgeService, nodeRepository, brainSearch, jdbcTemplate, tx
        service = new GitHubIntegrationService(
            integrationRepository,
            issueGitHubLinkRepository,
            workspaceRepository,
            issueRepository,
            oauthStateRepository,
            rt,
            visibilityGuard,
            knowledgeService,
            nodeRepository,
            brainSearch,
            jdbcTemplate,
            new TransactionTemplate(Mockito.mock(PlatformTransactionManager.class))
        );

        ReflectionTestUtils.setField(service, "clientId", "cid");
        ReflectionTestUtils.setField(service, "clientSecret", "secret");
        ReflectionTestUtils.setField(service, "frontendUrl", "http://localhost:3000");
        ReflectionTestUtils.setField(service, "apiUrl", "http://localhost:8080");

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

        String redirect = service.handleCallback("the-code", "the-state", null);

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

    @Test
    @DisplayName("sync : GET issues (per_page=100) → un node Brain OS créé par issue/PR")
    void sync_ingest_les_issues_en_nodes() {
        Mockito.when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
        Integration integration = Integration.builder()
            .workspace(workspace).provider(IntegrationProvider.GITHUB)
            .accessToken("gho_token").meta(Map.of()).build();
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(1L, IntegrationProvider.GITHUB))
            .thenReturn(Optional.of(integration));

        server.expect(requestTo(
                "https://api.github.com/repos/octocat/hello/issues?state=all&per_page=100&sort=updated"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer gho_token"))
            .andRespond(withSuccess(
                "[{\"number\":42,\"title\":\"Bug\",\"state\":\"open\",\"body\":\"details\","
                    + "\"html_url\":\"https://github.com/octocat/hello/issues/42\",\"user\":{\"login\":\"octocat\"}},"
                    + "{\"number\":7,\"title\":\"Feature\",\"state\":\"closed\","
                    + "\"html_url\":\"https://github.com/octocat/hello/pull/7\",\"pull_request\":{}}]",
                MediaType.APPLICATION_JSON));

        GitHubSyncResponse result = service.sync(SLUG, 9L, "octocat/hello");

        assertThat(result.created()).isEqualTo(2);
        assertThat(result.updated()).isZero();
        assertThat(result.total()).isEqualTo(2);
        // existingGitHubNodes (jdbcTemplate mocké) ne renvoie rien → tout passe par createNode
        Mockito.verify(knowledgeService, Mockito.times(2))
            .createNode(Mockito.eq(SLUG), Mockito.eq(9L), Mockito.any(CreateKnowledgeNodeRequest.class));
        server.verify();
    }

    // ── OSS-6.3 ──────────────────────────────────────────────────────────────

    private void connected() {
        Mockito.when(workspaceRepository.findBySlug(SLUG)).thenReturn(Optional.of(workspace));
        Mockito.when(integrationRepository.findByWorkspaceIdAndProvider(1L, IntegrationProvider.GITHUB))
            .thenReturn(Optional.of(Integration.builder().workspace(workspace).provider(IntegrationProvider.GITHUB)
                .accessToken("gho_token").meta(Map.of()).build()));
    }

    /** Issue 5 du workspace, avec ses liens. */
    private void issueWithLinks(IssueGitHubLink... links) {
        Project project = Project.builder().id(3L).workspace(workspace).build();
        Mockito.when(issueRepository.findById(5L)).thenReturn(Optional.of(Issue.builder().id(5L).project(project).build()));
        Mockito.when(issueGitHubLinkRepository.findByIssueIdOrderByLinkedAtDesc(5L)).thenReturn(List.of(links));
    }

    private static IssueGitHubLink pr(int number, GitHubLinkStatus status, LocalDateTime checkedAt) {
        return IssueGitHubLink.builder().id((long) number).linkType(GitHubLinkType.PR).repoFullName("octocat/hello")
            .prNumber(number).title("PR " + number).status(status).statusCheckedAt(checkedAt).build();
    }

    @Test
    @DisplayName("handleCallback : accès refusé → retour dans l'app avec github=error, sans appel ; state inconnu → racine")
    void handleCallback_access_denied() {
        OAuthState state = OAuthState.builder().state("s").provider(IntegrationProvider.GITHUB).workspace(workspace)
            .expiresAt(LocalDateTime.now().plusMinutes(5)).returnTo("/acme?newProject=repo").build();
        Mockito.when(oauthStateRepository.findById("s")).thenReturn(Optional.of(state));

        assertThat(service.handleCallback(null, "s", "access_denied"))
            .isEqualTo("http://localhost:3000/acme?newProject=repo&github=error");
        assertThat(service.handleCallback("code", "unknown", null)).isEqualTo("http://localhost:3000/?github=error");
        Mockito.verify(oauthStateRepository).delete(state);
        server.verify(); // aucune requête vers GitHub
    }

    @Test
    @DisplayName("getLinks : le statut d'une PR est relu chez GitHub (fusionnée) et enregistré avec son titre")
    void getLinks_refreshes_pull_request_status() {
        connected();
        IssueGitHubLink open = pr(7, GitHubLinkStatus.OPEN, null);
        issueWithLinks(open);
        server.expect(requestTo("https://api.github.com/repos/octocat/hello/pulls/7"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", "Bearer gho_token"))
            .andRespond(withSuccess("{\"state\":\"closed\",\"merged\":true,\"title\":\"Ship it\"}",
                MediaType.APPLICATION_JSON));

        var links = service.getLinks(SLUG, 5L, User.builder().id(9L).build());

        assertThat(links).singleElement().satisfies(l -> {
            assertThat(l.status()).isEqualTo("MERGED");
            assertThat(l.title()).isEqualTo("Ship it");
        });
        assertThat(open.getStatusCheckedAt()).isNotNull();
        Mockito.verify(issueGitHubLinkRepository).saveAll(List.of(open));
        server.verify();
    }

    @Test
    @DisplayName("getLinks : PR fusionnée, PR lue il y a moins de 5 min et commit ne sont pas relus")
    void getLinks_skips_fresh_merged_and_commits() {
        connected();
        IssueGitHubLink commit = IssueGitHubLink.builder().id(1L).linkType(GitHubLinkType.COMMIT)
            .repoFullName("octocat/hello").commitSha("abc1234").status(GitHubLinkStatus.OPEN).build();
        issueWithLinks(pr(1, GitHubLinkStatus.MERGED, null), pr(2, GitHubLinkStatus.OPEN, LocalDateTime.now().minusMinutes(1)),
            commit);

        assertThat(service.getLinks(SLUG, 5L, User.builder().id(9L).build())).hasSize(3);
        Mockito.verify(issueGitHubLinkRepository, Mockito.never()).saveAll(Mockito.any());
        server.verify(); // aucune requête
    }

    @Test
    @DisplayName("getLinks : cinq PR relues au plus par consultation")
    void getLinks_refresh_is_bounded() {
        connected();
        issueWithLinks(pr(1, GitHubLinkStatus.OPEN, null), pr(2, GitHubLinkStatus.OPEN, null),
            pr(3, GitHubLinkStatus.OPEN, null), pr(4, GitHubLinkStatus.CLOSED, null), pr(5, GitHubLinkStatus.OPEN, null),
            pr(6, GitHubLinkStatus.OPEN, null), pr(7, GitHubLinkStatus.OPEN, null));
        server.expect(ExpectedCount.times(5), requestTo(matchesPattern("https://api\\.github\\.com/repos/octocat/hello/pulls/\\d")))
            .andRespond(withSuccess("{\"state\":\"open\"}", MediaType.APPLICATION_JSON));

        service.getLinks(SLUG, 5L, User.builder().id(9L).build());

        server.verify();
    }

    @Test
    @DisplayName("getLinks : GitHub injoignable → statut gardé, rien d'enregistré, la liste est rendue")
    void getLinks_survives_github_outage() {
        connected();
        IssueGitHubLink open = pr(7, GitHubLinkStatus.OPEN, null);
        issueWithLinks(open, pr(8, GitHubLinkStatus.OPEN, null));
        server.expect(requestTo("https://api.github.com/repos/octocat/hello/pulls/7"))
            .andRespond(withException(new IOException("down")));

        var links = service.getLinks(SLUG, 5L, User.builder().id(9L).build());

        assertThat(links).extracting(l -> l.status()).containsExactly("OPEN", "OPEN");
        assertThat(open.getStatusCheckedAt()).isNull();
        Mockito.verify(issueGitHubLinkRepository, Mockito.never()).saveAll(Mockito.any());
        server.verify(); // la seconde PR n'est pas demandée
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
        "{\"state\":\"open\"}                                    | OPEN",
        "{\"state\":\"closed\"}                                  | CLOSED",
        "{\"state\":\"closed\",\"merged\":true}                  | MERGED",
        "{\"state\":\"closed\",\"merged_at\":\"2026-10-18T10:00:00Z\"} | MERGED",
    })
    @DisplayName("statut d'une PR : fusionnée prime sur fermée")
    void pull_request_status_mapping(String json, String expected) throws Exception {
        Map<String, Object> pr = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json,
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        assertThat(GitHubIntegrationService.pullRequestStatus(pr).name()).isEqualTo(expected);
    }

    @Test
    @DisplayName("disconnect : le jeton est révoqué chez GitHub (DELETE /applications/{client}/token, Basic)")
    void disconnect_revokes_the_token() {
        connected();
        server.expect(requestTo("https://api.github.com/applications/cid/token"))
            .andExpect(method(HttpMethod.DELETE))
            .andExpect(header("Authorization", "Basic " + java.util.Base64.getEncoder().encodeToString("cid:secret".getBytes())))
            .andExpect(jsonPath("$.access_token").value("gho_token"))
            .andRespond(withNoContent());

        service.disconnect(SLUG);

        Mockito.verify(integrationRepository).deleteByWorkspaceIdAndProvider(1L, IntegrationProvider.GITHUB);
        server.verify();
    }

    @Test
    @DisplayName("disconnect : une révocation refusée par GitHub n'empêche pas la déconnexion")
    void disconnect_survives_a_failed_revocation() {
        connected();
        server.expect(requestTo("https://api.github.com/applications/cid/token")).andRespond(withServerError());

        service.disconnect(SLUG);

        Mockito.verify(integrationRepository).deleteByWorkspaceIdAndProvider(1L, IntegrationProvider.GITHUB);
    }

    @Test
    @DisplayName("jeton refusé par GitHub (401) → message qui dit de reconnecter GitHub")
    void unauthorized_says_reconnect() {
        connected();
        server.expect(requestTo("https://api.github.com/user/repos?per_page=100&sort=updated"))
            .andRespond(withUnauthorizedRequest());

        assertThatThrownBy(() -> service.listRepositories(SLUG))
            .isInstanceOf(BusinessException.class).hasMessageContaining("reconnect GitHub");
    }

    @Test
    @DisplayName("dépôt introuvable (404) → ResourceNotFoundException ; limite (403) et panne (502, réseau) → 400 clair")
    void github_errors_are_explained() {
        connected();
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://api.github.com/repos/octocat/gone/")))
            .andRespond(withResourceNotFound());
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://api.github.com/repos/octocat/limit/")))
            .andRespond(withStatus(HttpStatus.FORBIDDEN));
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://api.github.com/repos/octocat/down/")))
            .andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://api.github.com/repos/octocat/offline/")))
            .andRespond(withException(new IOException("timeout")));

        assertThatThrownBy(() -> service.listRepoIssues(SLUG, "octocat/gone")).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.listRepoIssues(SLUG, "octocat/limit"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("rate limit");
        assertThatThrownBy(() -> service.listRepoIssues(SLUG, "octocat/down"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("HTTP 502");
        assertThatThrownBy(() -> service.listRepoIssues(SLUG, "octocat/offline"))
            .isInstanceOf(BusinessException.class).hasMessageContaining("can't be reached");
        server.verify();
    }

    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"octocat/hello?per_page=1", "octocat/hello#x", "octocat/..", "../etc", "octocat", "o/r/s", "-bad/name"})
    @DisplayName("un nom de dépôt mal formé est refusé avant tout appel à GitHub")
    void bad_repository_names_never_reach_github(String repo) {
        assertThatThrownBy(() -> service.listRepoIssues(SLUG, repo)).isInstanceOf(BusinessException.class);
        server.verify(); // aucune requête
    }

    @Test
    @DisplayName("createRepo : nom déjà pris (422) → message clair")
    void create_repo_name_taken() {
        connected();
        server.expect(requestTo("https://api.github.com/user/repos")).andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY));

        assertThatThrownBy(() -> service.createRepo(SLUG, "hello", true))
            .isInstanceOf(BusinessException.class).hasMessageContaining("already taken");
    }
}
