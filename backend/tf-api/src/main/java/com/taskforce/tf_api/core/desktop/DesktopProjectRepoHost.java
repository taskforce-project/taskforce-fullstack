package com.taskforce.tf_api.core.desktop;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.service.GitHubRepoNames;
import com.taskforce.tf_api.core.service.GitHubTokenSource;
import com.taskforce.tf_api.core.service.ProjectRepoHost;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.extern.slf4j.Slf4j;

/**
 * Dépôt d'un projet dans l'app desktop. La coque le crée et le vérifie avec le GitHub CLI de la personne
 * ({@code desktop/src/github.ts}), puis le lie ; le runner le clone et y ouvre ses pull requests avec ce même {@code gh}.
 * Le backend local n'a ni intégration GitHub ni jeton à lui : il garde le nom du dépôt, dont la forme est vérifiée en
 * amont ({@code GitHubRepoNames}).
 *
 * <p>Les dépôts que la conversation propose sont ceux de la personne, lus avec le jeton que son {@code gh} garde
 * ({@code DesktopGitHubTokenSource}), par la même requête que la coque (« user/repos », les derniers où elle a poussé
 * d'abord : les siens, ceux de ses organisations et ses collaborations). Test du CEO du 05/11/2026 : sans eux, la carte
 * n'offrait qu'« aucun dépôt », et son dépôt {@code test-taskforce} ne se trouvait pas.</p>
 *
 * <p>Prioritaire sur l'intégration GitHub de l'espace, présente dans ce profil mais jamais connectée.</p>
 */
@Primary
@Component
@Profile("desktop")
@Slf4j
public class DesktopProjectRepoHost implements ProjectRepoHost {

    static final String CREATED_ON_THIS_COMPUTER =
        "In the desktop app, the repository is created with GitHub CLI on this computer, then linked";

    /** La liste de la coque ({@code listRepos} de {@code desktop/src/github.ts}), par l'API de GitHub. */
    static final String REPOS =
        "https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member";

    private final GitHubTokenSource tokens;
    private final RestTemplate http;

    @Autowired
    public DesktopProjectRepoHost(GitHubTokenSource tokens) {
        this(tokens, client());
    }

    DesktopProjectRepoHost(GitHubTokenSource tokens, RestTemplate http) {
        this.tokens = tokens;
        this.http = http;
    }

    private static RestTemplate client() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(10));
        return new RestTemplate(factory);
    }

    @Override
    public String createRepo(String workspaceSlug, String repoName, boolean isPrivate) {
        throw new BusinessException(CREATED_ON_THIS_COMPUTER);
    }

    @Override
    public void assertRepoAccessible(String workspaceSlug, String repoFullName) {
        // L'accès se vérifie avec le `gh` de la personne : par la coque avant de lier, par le runner au clonage.
    }

    /** Le backend local ne crée pas de dépôt : la coque le fait, depuis la page du projet. */
    @Override
    public boolean createsRepos(String workspaceSlug) {
        return false;
    }

    /**
     * Les dépôts de la personne, les derniers où elle a poussé d'abord ; aucun quand elle n'est pas connectée à GitHub
     * sur cet ordinateur, ou que GitHub ne répond pas : la réponse libre reste.
     */
    @Override
    public List<String> recentRepos(String workspaceSlug, int limit) {
        Optional<String> token = tokens.token(null);
        if (token.isEmpty() || limit <= 0) return List.of();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token.get());
        headers.set("Accept", "application/vnd.github+json");
        try {
            List<Map<String, Object>> repos = http.exchange(REPOS, HttpMethod.GET, new HttpEntity<>(headers),
                new ParameterizedTypeReference<List<Map<String, Object>>>() {}).getBody();
            if (repos == null) return List.of();
            return repos.stream().map(repo -> Objects.toString(repo.get("full_name"), ""))
                .filter(GitHubRepoNames::isFullName).limit(limit).toList();
        } catch (RestClientException e) {
            log.debug("Dépôts GitHub de la personne non lus : {}", e.getMessage());
            return List.of();
        }
    }
}
