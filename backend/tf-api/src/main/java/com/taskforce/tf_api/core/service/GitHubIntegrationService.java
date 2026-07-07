package com.taskforce.tf_api.core.service;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.response.GitHubIssueResponse;
import com.taskforce.tf_api.core.dto.response.GitHubLinkResponse;
import com.taskforce.tf_api.core.dto.response.GitHubRepoResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationStatusResponse;
import com.taskforce.tf_api.core.dto.request.GitHubLinkRequest;
import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkType;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueGitHubLink;
import com.taskforce.tf_api.core.model.OAuthState;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class GitHubIntegrationService {

    private static final String GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize";
    private static final String GITHUB_TOKEN_URL       = "https://github.com/login/oauth/access_token";
    private static final String GITHUB_API_USER        = "https://api.github.com/user";

    @Value("${integrations.github.client-id:}")
    private String clientId;

    @Value("${integrations.github.client-secret:}")
    private String clientSecret;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    @Value("${app.url:http://localhost:8080}")
    private String appUrl;

    private final IntegrationRepository    integrationRepository;
    private final IssueGitHubLinkRepository issueGitHubLinkRepository;
    private final WorkspaceRepository      workspaceRepository;
    private final IssueRepository          issueRepository;
    private final OAuthStateRepository     oauthStateRepository;
    private final RestTemplate             restTemplate;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int STATE_TTL_MINUTES = 10;

    // ----------------------------------------------------------------
    // OAuth flow
    // ----------------------------------------------------------------

    /**
     * Émet un {@code state} aléatoire (anti-CSRF) lié au workspace + à l'utilisateur, le persiste,
     * et construit l'URL d'autorisation GitHub. Appelé via XHR authentifié (le front navigue ensuite
     * vers l'URL renvoyée).
     */
    @Transactional
    public URI buildAuthorizeUrl(String workspaceSlug, User user) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));

        oauthStateRepository.deleteByExpiresAtBefore(LocalDateTime.now());
        String state = newState();
        oauthStateRepository.save(OAuthState.builder()
            .state(state)
            .provider(IntegrationProvider.GITHUB)
            .workspace(workspace)
            .user(user)
            .expiresAt(LocalDateTime.now().plusMinutes(STATE_TTL_MINUTES))
            .build());

        String callbackUrl = appUrl + "/api/integrations/github/callback";
        String url = GITHUB_OAUTH_AUTHORIZE
            + "?client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(callbackUrl)
            + "&scope=repo,read:org"
            + "&state=" + encode(state);
        return URI.create(url);
    }

    @Transactional
    public String handleCallback(String code, String state) {
        // 0. Résoudre + valider le state (workspace fiable, pas un slug devinable)
        OAuthState oauthState = oauthStateRepository.findById(state)
            .filter(s -> s.getProvider() == IntegrationProvider.GITHUB)
            .orElseThrow(() -> new BusinessException("État OAuth invalide"));
        if (oauthState.getExpiresAt().isBefore(LocalDateTime.now())) {
            oauthStateRepository.delete(oauthState);
            throw new BusinessException("État OAuth expiré, relancez la connexion");
        }
        Workspace workspace = oauthState.getWorkspace();

        // 1. Exchange code for token
        String accessToken = exchangeCodeForToken(code);

        // 2. Fetch GitHub user info
        Map<String, Object> ghUser = fetchGitHubUser(accessToken);
        String login     = String.valueOf(ghUser.getOrDefault("login", ""));
        String avatarUrl = String.valueOf(ghUser.getOrDefault("avatar_url", ""));

        // 3. Persist integration (upsert)
        Optional<Integration> existing = integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB);

        Map<String, String> meta = new HashMap<>();
        meta.put("login", login);
        meta.put("avatarUrl", avatarUrl);

        Integration integration = existing.orElseGet(() ->
            Integration.builder()
                .workspace(workspace)
                .provider(IntegrationProvider.GITHUB)
                .build()
        );
        integration.setAccessToken(accessToken);
        integration.setMeta(meta);
        integration.setInstalledBy(oauthState.getUser());
        integrationRepository.save(integration);

        // 4. State consommé
        oauthStateRepository.delete(oauthState);

        // 5. Redirect to frontend
        return frontendUrl + "/" + workspace.getSlug() + "/settings?section=integrations&github=connected";
    }

    private String newState() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    @Transactional
    public void disconnect(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        integrationRepository.deleteByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB);
    }

    public IntegrationStatusResponse getStatus(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB)
            .map(i -> new IntegrationStatusResponse(i.getId(), "GITHUB", true, i.getMeta(), i.getConnectedAt()))
            .orElse(new IntegrationStatusResponse(null, "GITHUB", false, Map.of(), null));
    }

    // ----------------------------------------------------------------
    // Issue links
    // ----------------------------------------------------------------

    @Transactional
    public GitHubLinkResponse addLink(Long issueId, GitHubLinkRequest req, User linkedBy) {
        Issue issue = issueRepository.findById(issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Issue not found: " + issueId));

        IssueGitHubLink link = IssueGitHubLink.builder()
            .issue(issue)
            .linkType(GitHubLinkType.valueOf(req.linkType()))
            .repoFullName(req.repoFullName())
            .prNumber(req.prNumber())
            .prUrl(req.prUrl())
            .commitSha(req.commitSha())
            .commitUrl(req.commitUrl())
            .title(req.title())
            .status(GitHubLinkStatus.OPEN)
            .linkedBy(linkedBy)
            .build();

        issueGitHubLinkRepository.save(link);
        return toResponse(link);
    }

    public List<GitHubLinkResponse> getLinks(Long issueId) {
        return issueGitHubLinkRepository.findByIssueIdOrderByLinkedAtDesc(issueId)
            .stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public void deleteLink(Long linkId) {
        issueGitHubLinkRepository.deleteById(linkId);
    }

    // ----------------------------------------------------------------
    // Sync read (PROD-5.1) : lecture des dépôts / issues / PR via l'API GitHub
    // ----------------------------------------------------------------

    /** Liste les dépôts accessibles via le token connecté du workspace. */
    public List<GitHubRepoResponse> listRepositories(String workspaceSlug) {
        String token = requireAccessToken(workspaceSlug);
        List<Map<String, Object>> repos = githubGetList(token,
            "https://api.github.com/user/repos?per_page=100&sort=updated");
        return repos.stream().map(r -> new GitHubRepoResponse(
            str(r.get("full_name")),
            str(r.get("name")),
            Boolean.TRUE.equals(r.get("private")),
            str(r.get("html_url")),
            r.get("open_issues_count") instanceof Number n ? n.intValue() : 0
        )).toList();
    }

    /** Liste les issues + PR d'un dépôt (l'API GitHub renvoie les deux ; PR = champ {@code pull_request}). */
    @SuppressWarnings("unchecked")
    public List<GitHubIssueResponse> listRepoIssues(String workspaceSlug, String repoFullName) {
        String token = requireAccessToken(workspaceSlug);
        List<Map<String, Object>> issues = githubGetList(token,
            "https://api.github.com/repos/" + repoFullName + "/issues?state=all&per_page=50&sort=updated");
        return issues.stream().map(i -> {
            Map<String, Object> user = i.get("user") instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
            return new GitHubIssueResponse(
                i.get("number") instanceof Number n ? n.intValue() : 0,
                str(i.get("title")),
                str(i.get("state")),
                str(i.get("html_url")),
                i.get("pull_request") != null,
                user != null ? str(user.get("login")) : null,
                str(i.get("updated_at"))
            );
        }).toList();
    }

    private String requireAccessToken(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB)
            .map(Integration::getAccessToken)
            .orElseThrow(() -> new BusinessException("GitHub n'est pas connecté pour ce workspace"));
    }

    private List<Map<String, Object>> githubGetList(String token, String url) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        ResponseEntity<List<Map<String, Object>>> resp = restTemplate.exchange(
            url, HttpMethod.GET, new HttpEntity<>(headers),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});
        return resp.getBody() != null ? resp.getBody() : List.of();
    }

    private String str(Object o) {
        return o != null ? String.valueOf(o) : null;
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    private String exchangeCodeForToken(String code) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        headers.setAccept(Arrays.asList(MediaType.APPLICATION_JSON));

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id",     clientId);
        body.add("client_secret", clientSecret);
        body.add("code",          code);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
            GITHUB_TOKEN_URL,
            HttpMethod.POST,
            request,
            new ParameterizedTypeReference<Map<String, Object>>() {}
        );

        Map<String, Object> responseBody = response.getBody();
        if (responseBody == null || !responseBody.containsKey("access_token")) {
            throw new RuntimeException("Failed to obtain GitHub access token");
        }
        return String.valueOf(responseBody.get("access_token"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchGitHubUser(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.set("Accept", "application/vnd.github+json");

        HttpEntity<Void> request = new HttpEntity<>(headers);
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
            GITHUB_API_USER,
            HttpMethod.GET,
            request,
            new ParameterizedTypeReference<Map<String, Object>>() {}
        );
        return response.getBody() != null ? response.getBody() : Map.of();
    }

    private GitHubLinkResponse toResponse(IssueGitHubLink link) {
        return new GitHubLinkResponse(
            link.getId(),
            link.getLinkType().name(),
            link.getRepoFullName(),
            link.getPrNumber(),
            link.getPrUrl(),
            link.getCommitSha(),
            link.getCommitUrl(),
            link.getTitle(),
            link.getStatus().name(),
            link.getLinkedAt()
        );
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
