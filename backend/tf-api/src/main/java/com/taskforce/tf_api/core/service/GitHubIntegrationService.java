package com.taskforce.tf_api.core.service;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.GitHubLinkRequest;
import com.taskforce.tf_api.core.dto.response.GitHubIssueResponse;
import com.taskforce.tf_api.core.dto.response.GitHubLinkResponse;
import com.taskforce.tf_api.core.dto.response.GitHubRepoResponse;
import com.taskforce.tf_api.core.dto.response.GitHubSyncResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationStatusResponse;
import com.taskforce.tf_api.core.enums.GitHubLinkStatus;
import com.taskforce.tf_api.core.enums.GitHubLinkType;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueGitHubLink;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.model.OAuthState;
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
import com.taskforce.tf_api.shared.security.SafeReturnPath;

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

    // Base du BACKEND pour le callback OAuth (distincte de app.url = front, cf. EmailService).
    @Value("${app.api-url:http://localhost:8080}")
    private String apiUrl;

    private final IntegrationRepository    integrationRepository;
    private final IssueGitHubLinkRepository issueGitHubLinkRepository;
    private final WorkspaceRepository      workspaceRepository;
    private final IssueRepository          issueRepository;
    private final OAuthStateRepository     oauthStateRepository;
    private final RestTemplate             restTemplate;
    private final ProjectVisibilityGuard   visibilityGuard;

    // Ingestion Brain OS (meme patron que PlaneIntegrationService).
    private final KnowledgeService         knowledgeService;
    private final KnowledgeNodeRepository  nodeRepository;
    private final BrainSearchService       brainSearch;
    private final JdbcTemplate             jdbcTemplate;
    private final TransactionTemplate      tx;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int STATE_TTL_MINUTES = 10;
    /** Marqueur de provenance dans {@code metadata.source} (cle de deduplication cote Brain OS). */
    private static final String SOURCE = "github";
    /** Borne de securite sur le corps ingere (evite qu'une issue geante gonfle le node + l'embedding). */
    private static final int MAX_BODY = 6000;
    /** Au-delà, le statut d'une PR liée est relu chez GitHub quand on consulte les liens de son issue. */
    private static final Duration PR_STATUS_TTL = Duration.ofMinutes(5);
    /** PR relues au plus par consultation : borne l'attente quand une issue porte beaucoup de PR. */
    private static final int PR_REFRESH_BUDGET = 5;

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
        return buildAuthorizeUrl(workspaceSlug, user, null);
    }

    /**
     * Variante avec <b>retour fluide</b> : {@code returnTo} est le chemin applicatif où revenir après le
     * consentement (ex. le dialogue de création de projet, qui se rouvre). Il n'est gardé que s'il est sûr
     * ({@link SafeReturnPath}) ; sinon le retour se fait sur Settings, comme sans lui.
     */
    @Transactional
    public URI buildAuthorizeUrl(String workspaceSlug, User user, String returnTo) {
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
            .returnTo(SafeReturnPath.withinWorkspace(returnTo, workspaceSlug))
            .build());

        String callbackUrl = apiUrl + "/api/integrations/github/callback";
        String url = GITHUB_OAUTH_AUTHORIZE
            + "?client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(callbackUrl)
            + "&scope=repo,read:org"
            + "&state=" + encode(state);
        return URI.create(url);
    }

    /**
     * Retour de GitHub. Le workspace vient du {@code state} (jamais d'un slug devinable). Renvoie toujours une URL
     * de l'application, avec {@code github=connected} ou {@code github=error} (accès refusé, state expiré,
     * échange du code échoué) : le navigateur ne reste plus sur une erreur JSON de l'API (OSS-6.3).
     */
    @Transactional
    public String handleCallback(String code, String state, String error) {
        OAuthState oauthState = state == null || state.isBlank() ? null : oauthStateRepository.findById(state)
            .filter(s -> s.getProvider() == IntegrationProvider.GITHUB)
            .orElse(null);
        if (oauthState == null) return frontendUrl + "/?github=error"; // state inconnu : workspace inconnu
        Workspace workspace = oauthState.getWorkspace();
        String returnTo = oauthState.getReturnTo();
        User installedBy = oauthState.getUser();
        boolean expired = oauthState.getExpiresAt().isBefore(LocalDateTime.now());
        oauthStateRepository.delete(oauthState); // usage unique, même en échec
        try {
            if (error != null && !error.isBlank()) throw new BusinessException("GitHub authorization refused: " + error);
            if (expired) throw new BusinessException("OAuth state expired");
            if (code == null || code.isBlank()) throw new BusinessException("Missing authorization code");
            connect(workspace, installedBy, code);
            return appRedirect(workspace, returnTo, "connected");
        } catch (RuntimeException e) {
            log.warn("GitHub connection failed for workspace {}: {}", workspace.getId(), e.getMessage());
            return appRedirect(workspace, returnTo, "error");
        }
    }

    /** Là d'où la connexion a été lancée (chemin validé à l'écriture, borné au workspace), sinon Settings. */
    private String appRedirect(Workspace workspace, String returnTo, String result) {
        if (returnTo != null && !returnTo.isBlank()) {
            return frontendUrl + returnTo + (returnTo.contains("?") ? "&" : "?") + "github=" + result;
        }
        return frontendUrl + "/" + workspace.getSlug() + "/settings?section=integrations&github=" + result;
    }

    /** Échange le code contre un jeton, lit le compte GitHub et enregistre la connexion du workspace. */
    private void connect(Workspace workspace, User installedBy, String code) {
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
        integration.setInstalledBy(installedBy);
        integrationRepository.save(integration);
    }

    private String newState() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * Déconnecte GitHub du workspace et révoque le jeton chez GitHub (OSS-6.3) : supprimer la ligne ne suffisait
     * pas, le jeton (portée {@code repo}) restait valide. Suppression dans une transaction courte, révocation
     * ensuite, hors transaction et sans bloquer la déconnexion si GitHub ne répond pas.
     */
    public void disconnect(String workspaceSlug) {
        String token = tx.execute(status -> {
            Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
            String current = integrationRepository
                .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB)
                .map(Integration::getAccessToken)
                .orElse(null);
            integrationRepository.deleteByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB);
            return current;
        });
        if (token != null) revokeToken(token);
    }

    /** {@code DELETE /applications/{client_id}/token} : invalide ce jeton seulement (best-effort). */
    private void revokeToken(String token) {
        if (clientId.isBlank() || clientSecret.isBlank()) return;
        HttpHeaders headers = new HttpHeaders();
        headers.setBasicAuth(clientId, clientSecret);
        headers.set("Accept", "application/vnd.github+json");
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            restTemplate.exchange("https://api.github.com/applications/" + encode(clientId) + "/token",
                HttpMethod.DELETE, new HttpEntity<>(Map.of("access_token", token), headers), Void.class);
        } catch (RestClientException e) {
            log.warn("GitHub token not revoked at disconnect: {}", e.getMessage());
        }
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

    /**
     * Résout une issue en la <b>scopant au workspace {@code {slug}}</b> du chemin (fix <b>H1</b>,
     * TF-SEC-IDOR). Sans ce contrôle, un {@code issueId} séquentiel laissait lire/écrire/supprimer les
     * liens GitHub de n'importe quelle issue de n'importe quel compte. On renvoie 404 (pas 403) pour ne
     * pas révéler l'existence d'une issue d'un autre tenant.
     */
    private Issue scopedIssue(String workspaceSlug, Long issueId) {
        Issue issue = issueRepository.findById(issueId)
            .orElseThrow(() -> new ResourceNotFoundException("Issue not found: " + issueId));
        if (!issue.getProject().getWorkspace().getSlug().equals(workspaceSlug)) {
            throw new ResourceNotFoundException("Issue not found: " + issueId);
        }
        return issue;
    }

    @Transactional
    public GitHubLinkResponse addLink(String workspaceSlug, Long issueId, GitHubLinkRequest req, User linkedBy) {
        Issue issue = scopedIssue(workspaceSlug, issueId);
        visibilityGuard.assertCanWrite(issue.getProject(), linkedBy.getId()); // ajouter un lien = écriture
        GitHubLinkType type = GitHubLinkType.valueOf(req.linkType());
        if (type == GitHubLinkType.PR && req.prNumber() == null) {
            throw new BusinessException("A pull request link needs the pull request number");
        }
        if (type == GitHubLinkType.COMMIT && (req.commitSha() == null || req.commitSha().isBlank())) {
            throw new BusinessException("A commit link needs the commit hash");
        }

        IssueGitHubLink link = IssueGitHubLink.builder()
            .issue(issue)
            .linkType(type)
            .repoFullName(GitHubRepoNames.requireFullName(req.repoFullName()))
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

    /**
     * Liens d'une issue, avec le statut des PR relu chez GitHub quand il date de plus de 5 minutes (OSS-6.3 :
     * il n'était écrit qu'à la création du lien). Lecture et écriture en transactions courtes, appels à GitHub
     * entre les deux (PC-022) ; sans GitHub connecté, les statuts enregistrés sont rendus tels quels.
     */
    public List<GitHubLinkResponse> getLinks(String workspaceSlug, Long issueId, User requester) {
        IssueLinks view = tx.execute(status -> {
            Issue issue = scopedIssue(workspaceSlug, issueId);
            visibilityGuard.assertCanView(issue.getProject(), requester.getId());
            String token = integrationRepository
                .findByWorkspaceIdAndProvider(issue.getProject().getWorkspace().getId(), IntegrationProvider.GITHUB)
                .map(Integration::getAccessToken)
                .orElse(null);
            return new IssueLinks(issueGitHubLinkRepository.findByIssueIdOrderByLinkedAtDesc(issue.getId()), token);
        });
        List<IssueGitHubLink> refreshed = view.token() == null ? List.of() : refreshPullRequests(view.links(), view.token());
        if (!refreshed.isEmpty()) tx.executeWithoutResult(status -> issueGitHubLinkRepository.saveAll(refreshed));
        return view.links().stream().map(this::toResponse).toList();
    }

    private record IssueLinks(List<IssueGitHubLink> links, String token) {}

    /**
     * Relit chez GitHub le statut des PR liées dont la dernière lecture date de plus de {@link #PR_STATUS_TTL}
     * ({@link #PR_REFRESH_BUDGET} au plus). Une PR fusionnée l'est pour de bon, elle n'est plus relue. Une erreur
     * sur une PR garde son statut jusqu'à la prochaine relecture ; GitHub injoignable arrête les relectures.
     * Renvoie les liens relus, à enregistrer.
     */
    private List<IssueGitHubLink> refreshPullRequests(List<IssueGitHubLink> links, String token) {
        LocalDateTime staleBefore = LocalDateTime.now().minus(PR_STATUS_TTL);
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        List<IssueGitHubLink> refreshed = new ArrayList<>();
        for (IssueGitHubLink link : links) {
            if (refreshed.size() >= PR_REFRESH_BUDGET) break;
            if (link.getLinkType() != GitHubLinkType.PR || link.getPrNumber() == null) continue;
            if (link.getStatus() == GitHubLinkStatus.MERGED) continue;
            if (link.getStatusCheckedAt() != null && link.getStatusCheckedAt().isAfter(staleBefore)) continue;
            if (!GitHubRepoNames.isFullName(link.getRepoFullName())) continue;
            try {
                Map<String, Object> pr = restTemplate.exchange(
                    "https://api.github.com/repos/" + link.getRepoFullName() + "/pulls/" + link.getPrNumber(),
                    HttpMethod.GET, new HttpEntity<>(headers),
                    new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
                if (pr != null) {
                    link.setStatus(pullRequestStatus(pr));
                    String title = str(pr.get("title"));
                    if (title != null && !title.isBlank()) link.setTitle(truncate(title, 500));
                }
            } catch (HttpStatusCodeException e) {
                log.debug("Pull request {}#{} not refreshed: HTTP {}", link.getRepoFullName(), link.getPrNumber(),
                    e.getStatusCode().value());
            } catch (RestClientException e) {
                log.warn("GitHub unreachable, pull request statuses not refreshed: {}", e.getMessage());
                break;
            }
            link.setStatusCheckedAt(LocalDateTime.now());
            refreshed.add(link);
        }
        return refreshed;
    }

    /** Statut d'une PR d'après l'API GitHub : fusionnée prime sur fermée (une PR fusionnée est aussi fermée). */
    static GitHubLinkStatus pullRequestStatus(Map<String, Object> pr) {
        if (Boolean.TRUE.equals(pr.get("merged")) || pr.get("merged_at") != null) return GitHubLinkStatus.MERGED;
        return "closed".equals(String.valueOf(pr.get("state"))) ? GitHubLinkStatus.CLOSED : GitHubLinkStatus.OPEN;
    }

    @Transactional
    public void deleteLink(String workspaceSlug, Long linkId, User requester) {
        IssueGitHubLink link = issueGitHubLinkRepository.findById(linkId)
            .orElseThrow(() -> new ResourceNotFoundException("GitHub link not found"));
        Issue issue = link.getIssue();
        if (!issue.getProject().getWorkspace().getSlug().equals(workspaceSlug)) {
            throw new ResourceNotFoundException("GitHub link not found"); // cross-tenant → 404
        }
        visibilityGuard.assertCanWrite(issue.getProject(), requester.getId());
        issueGitHubLinkRepository.delete(link);
    }

    // ----------------------------------------------------------------
    // Sync read (PROD-5.1) : lecture des dépôts / issues / PR via l'API GitHub
    // ----------------------------------------------------------------

    /** Liste les dépôts accessibles via le token connecté du workspace. */
    public List<GitHubRepoResponse> listRepositories(String workspaceSlug) {
        String token = requireAccessToken(workspaceSlug);
        List<Map<String, Object>> repos = githubGetList(token,
            "https://api.github.com/user/repos?per_page=100&sort=updated", "Account");
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
        String repo = GitHubRepoNames.requireFullName(repoFullName);
        String token = requireAccessToken(workspaceSlug);
        List<Map<String, Object>> issues = githubGetList(token,
            "https://api.github.com/repos/" + repo + "/issues?state=all&per_page=50&sort=updated", "Repository " + repo);
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

    /**
     * Crée un dépôt GitHub sur le compte connecté du workspace (scope {@code repo} déjà consenti à la
     * connexion). {@code auto_init=true} pour que le dépôt ait un commit initial → clonable tout de suite
     * par un coding agent (TF-AGENT-DELIVERY). Renvoie le {@code "owner/name"} du dépôt créé.
     */
    public String createRepo(String workspaceSlug, String repoName, boolean isPrivate) {
        String name = GitHubRepoNames.requireName(repoName);
        String token = requireAccessToken(workspaceSlug);
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("private", isPrivate);
        body.put("auto_init", true);
        return callGitHub("Account", () -> {
            try {
                ResponseEntity<Map<String, Object>> resp = restTemplate.exchange(
                    "https://api.github.com/user/repos", HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    new ParameterizedTypeReference<Map<String, Object>>() {});
                String fullName = resp.getBody() != null ? str(resp.getBody().get("full_name")) : null;
                if (fullName == null || fullName.isBlank()) {
                    throw new BusinessException("Creating the GitHub repository failed (unexpected response)");
                }
                return fullName;
            } catch (HttpClientErrorException.UnprocessableEntity e) {
                throw new BusinessException("GitHub refused to create the repository '" + name
                    + "': the name is already taken on the account, or invalid");
            }
        });
    }

    /** Vérifie qu'un dépôt {@code "owner/name"} existe et est accessible via le token du workspace. */
    public void assertRepoAccessible(String workspaceSlug, String repoFullName) {
        String repo = GitHubRepoNames.requireFullName(repoFullName);
        String token = requireAccessToken(workspaceSlug);
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        callGitHub("Repository " + repo, () -> restTemplate.exchange("https://api.github.com/repos/" + repo,
            HttpMethod.GET, new HttpEntity<>(headers), new ParameterizedTypeReference<Map<String, Object>>() {}));
    }

    private String requireAccessToken(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB)
            .map(Integration::getAccessToken)
            .orElseThrow(() -> new BusinessException("GitHub isn't connected for this workspace"));
    }

    private List<Map<String, Object>> githubGetList(String token, String url, String what) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        ResponseEntity<List<Map<String, Object>>> resp = callGitHub(what, () -> restTemplate.exchange(
            url, HttpMethod.GET, new HttpEntity<>(headers),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {}));
        return resp.getBody() != null ? resp.getBody() : List.of();
    }

    /**
     * Appel à l'API GitHub avec le jeton du workspace (OSS-6.3). Une erreur de GitHub devient un message qui dit
     * quoi faire au lieu d'une 500 opaque : jeton refusé (reconnecter GitHub), objet introuvable, droits ou limite
     * de débit, erreur de GitHub, GitHub injoignable. {@code what} nomme l'objet demandé (« Repository o/n »).
     */
    private <T> T callGitHub(String what, Supplier<T> call) {
        try {
            return call.get();
        } catch (HttpClientErrorException.Unauthorized e) {
            throw new BusinessException(
                "GitHub refused the workspace connection: reconnect GitHub in Settings > Integrations");
        } catch (HttpClientErrorException.NotFound e) {
            throw new ResourceNotFoundException(what + " not found on GitHub, or not visible to the workspace connection");
        } catch (HttpClientErrorException.Forbidden | HttpClientErrorException.TooManyRequests e) {
            throw new BusinessException("GitHub refused the request (permissions or rate limit): try again later");
        } catch (HttpStatusCodeException e) {
            throw new BusinessException("GitHub answered with an error (HTTP " + e.getStatusCode().value()
                + "): try again later");
        } catch (ResourceAccessException e) {
            throw new BusinessException("GitHub can't be reached right now: try again later");
        }
    }

    private String str(Object o) {
        return o != null ? String.valueOf(o) : null;
    }

    // ----------------------------------------------------------------
    // Synchronisation -> ingestion Brain OS (jambe « observe »)
    // ----------------------------------------------------------------

    /**
     * Synchronise les issues + PR d'un depot GitHub vers le Brain OS.
     *
     * <p>Meme patron que {@link PlaneIntegrationService#sync} : lecture seule cote GitHub, chaque
     * issue/PR devient un node de connaissance dedupe par {@code metadata.externalId} (= {@code depot#numero})
     * puis embedde. On ne reecrit jamais rien chez GitHub.
     */
    @Transactional
    public GitHubSyncResponse sync(String workspaceSlug, Long userId, String repoName) {
        String repoFullName = GitHubRepoNames.requireFullName(repoName);
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        String token = integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.GITHUB)
            .map(Integration::getAccessToken)
            .orElseThrow(() -> new BusinessException("GitHub isn't connected for this workspace"));

        List<Map<String, Object>> issues = githubGetList(token,
            "https://api.github.com/repos/" + repoFullName + "/issues?state=all&per_page=100&sort=updated",
            "Repository " + repoFullName);

        Map<String, Long> existing = existingGitHubNodes(workspace.getId());
        int created = 0, updated = 0;
        for (Map<String, Object> issue : issues) {
            Integer number = issue.get("number") instanceof Number n ? n.intValue() : null;
            if (number == null) continue;
            String externalId = repoFullName + "#" + number;
            String title = truncate("[GitHub] " + safe(str(issue.get("title")), "Untitled"), 300);
            String content = buildIssueContent(repoFullName, number, issue);
            Map<String, Object> metadata = issueMetadata(repoFullName, number, issue);

            Long nodeId = existing.get(externalId);
            if (nodeId != null) {
                KnowledgeNode node = nodeRepository.findById(nodeId).orElse(null);
                if (node != null) {
                    node.setTitle(title);
                    node.setContent(content);
                    node.setMetadata(metadata);
                    node.setUpdatedBy(String.valueOf(userId));
                    nodeRepository.save(node);
                    brainSearch.markForReindex(node.getId()); // l'issue a pu changer : vecteur recalculé en tâche de fond
                    updated++;
                }
            } else {
                CreateKnowledgeNodeRequest req = CreateKnowledgeNodeRequest.builder()
                    .type("NOTE")
                    .domain("PROJET")
                    .title(title)
                    .content(content)
                    .tags(List.of("github", "external"))
                    .metadata(metadata)
                    .build();
                knowledgeService.createNode(workspaceSlug, userId, req); // embed + link-sync inclus
                created++;
            }
        }
        log.info("Sync GitHub workspace {} depot {} : {} crees, {} MAJ ({} issues/PR)",
            workspace.getId(), repoFullName, created, updated, issues.size());
        return new GitHubSyncResponse(created, updated, issues.size());
    }

    private Map<String, Long> existingGitHubNodes(Long workspaceId) {
        Map<String, Long> map = new HashMap<>();
        jdbcTemplate.query(
            "SELECT id, metadata->>'externalId' AS ext FROM knowledge_nodes "
            + "WHERE workspace_id = ? AND metadata->>'source' = ?",
            rs -> { map.put(rs.getString("ext"), rs.getLong("id")); },
            workspaceId, SOURCE);
        return map;
    }

    @SuppressWarnings("unchecked")
    private String buildIssueContent(String repoFullName, int number, Map<String, Object> issue) {
        boolean isPr = issue.get("pull_request") != null;
        String body = str(issue.get("body"));
        Map<String, Object> user = issue.get("user") instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
        String author = user != null ? str(user.get("login")) : null;
        String url = str(issue.get("html_url"));
        StringBuilder sb = new StringBuilder();
        sb.append(body != null && !body.isBlank() ? truncate(body.trim(), MAX_BODY) : "_(no description)_");
        sb.append("\n\n> ").append(isPr ? "Pull request" : "Issue").append(' ')
          .append(repoFullName).append(" #").append(number)
          .append(" · Etat : ").append(safe(str(issue.get("state")), "n/a"));
        if (author != null) sb.append(" · Auteur : ").append(author);
        if (url != null) sb.append("\n> ").append(url);
        return sb.toString();
    }

    private Map<String, Object> issueMetadata(String repoFullName, int number, Map<String, Object> issue) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", SOURCE);
        m.put("externalId", repoFullName + "#" + number);
        m.put("repo", repoFullName);
        m.put("number", number);
        m.put("kind", issue.get("pull_request") != null ? "pr" : "issue");
        if (str(issue.get("state")) != null) m.put("state", str(issue.get("state")));
        if (str(issue.get("html_url")) != null) m.put("url", str(issue.get("html_url")));
        return m;
    }

    private String safe(String v, String fallback) {
        return v != null && !v.isBlank() ? v : fallback;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) : s;
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
            throw new BusinessException("GitHub didn't return an access token");
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
