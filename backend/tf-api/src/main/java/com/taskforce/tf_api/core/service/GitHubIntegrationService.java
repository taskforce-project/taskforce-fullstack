package com.taskforce.tf_api.core.service;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
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

import com.taskforce.tf_api.core.dto.response.GitHubLinkResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationStatusResponse;
import com.taskforce.tf_api.core.dto.request.GitHubLinkRequest;
import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkType;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueGitHubLink;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueGitHubLinkRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
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
    private final RestTemplate             restTemplate;

    // ----------------------------------------------------------------
    // OAuth flow
    // ----------------------------------------------------------------

    public URI buildAuthorizeUrl(String workspaceSlug) {
        String callbackUrl = appUrl + "/api/integrations/github/callback";
        String url = GITHUB_OAUTH_AUTHORIZE
            + "?client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(callbackUrl)
            + "&scope=repo,read:org"
            + "&state=" + encode(workspaceSlug);
        return URI.create(url);
    }

    @Transactional
    public String handleCallback(String code, String workspaceSlug) {
        // 1. Exchange code for token
        String accessToken = exchangeCodeForToken(code);

        // 2. Fetch GitHub user info
        Map<String, Object> ghUser = fetchGitHubUser(accessToken);
        String login     = String.valueOf(ghUser.getOrDefault("login", ""));
        String avatarUrl = String.valueOf(ghUser.getOrDefault("avatar_url", ""));

        // 3. Persist integration (upsert)
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));

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
        integrationRepository.save(integration);

        // 4. Redirect to frontend
        return frontendUrl + "/" + workspaceSlug + "/settings?section=integrations&github=connected";
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
