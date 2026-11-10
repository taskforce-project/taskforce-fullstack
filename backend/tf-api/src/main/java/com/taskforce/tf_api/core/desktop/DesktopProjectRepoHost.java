package com.taskforce.tf_api.core.desktop;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
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
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.service.GitHubRepoNames;
import com.taskforce.tf_api.core.service.GitHubTokenSource;
import com.taskforce.tf_api.core.service.ProjectRepoHost;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.extern.slf4j.Slf4j;

/**
 * Dépôt d'un projet dans l'app desktop. Depuis la page du projet, la coque le crée et le vérifie avec le GitHub CLI de la
 * personne ({@code desktop/src/github.ts}), puis le lie ; le runner le clone et y ouvre ses pull requests avec ce même
 * {@code gh}. Le backend local n'a ni intégration GitHub ni jeton à lui : il garde le nom du dépôt, dont la forme est
 * vérifiée en amont ({@code GitHubRepoNames}).
 *
 * <p>Depuis la conversation (TF-J1-15, test du CEO du 09/11/2026 : « TaskForce can't create a repository here. Dommage
 * mdr »), il le crée lui-même avec le jeton que le {@code gh} de la personne garde, quand ce jeton en a le droit : la
 * carte ne le propose qu'alors (R15), et son clic est l'accord.</p>
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

    static final String NOT_CONNECTED = "GitHub CLI isn't signed in on this computer: run gh auth login, then try again";

    /** La liste de la coque ({@code listRepos} de {@code desktop/src/github.ts}), par l'API de GitHub. */
    static final String REPOS =
        "https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member";
    static final String CREATE = "https://api.github.com/user/repos";
    static final String USER = "https://api.github.com/user";
    /** Ce que GitHub dit des droits d'un jeton OAuth ; un jeton sans ce droit ne crée pas un dépôt privé. */
    static final String SCOPES = "X-OAuth-Scopes";
    private static final String REPO_SCOPE = "repo";
    /** Ce que GitHub répond quand ce nom ne se crée pas (déjà pris, ou invalide). */
    private static final int NAME_REFUSED = 422;
    /** Le temps d'une carte et de sa réponse : les droits du jeton ne se relisent pas à chaque question. */
    static final Duration SCOPES_KEPT = Duration.ofSeconds(60);

    private final GitHubTokenSource tokens;
    private final RestTemplate http;
    private volatile Scopes scopes;

    /** Ce que GitHub a dit de ce jeton, et quand. */
    private record Scopes(String token, boolean canCreate, Instant at) {}

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

    /** Crée le dépôt sur le compte du {@code gh} de la personne, avec un premier commit : clonable tout de suite par un agent. */
    @Override
    public String createRepo(String workspaceSlug, String repoName, boolean isPrivate) {
        String name = GitHubRepoNames.requireName(repoName);
        String token = tokens.token(null).orElseThrow(() -> new BusinessException(NOT_CONNECTED));
        HttpHeaders headers = headers(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> body = Map.of("name", name, "private", isPrivate, "auto_init", true);
        try {
            Map<String, Object> created = http.exchange(CREATE, HttpMethod.POST, new HttpEntity<>(body, headers),
                new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
            String fullName = created == null ? null : Objects.toString(created.get("full_name"), null);
            if (!GitHubRepoNames.isFullName(fullName)) {
                throw new BusinessException("GitHub didn't say which repository it created");
            }
            return fullName;
        } catch (HttpClientErrorException refused) {
            log.debug("Dépôt GitHub refusé : {}", refused.getStatusCode());
            throw new BusinessException(refused.getStatusCode().value() == NAME_REFUSED
                ? "GitHub refused the name '" + name + "': a repository of yours may already have it"
                : "GitHub refused to create the repository: check that GitHub CLI is signed in with the repo scope");
        } catch (RestClientException e) {
            log.debug("Dépôt GitHub non créé : {}", e.getMessage());
            throw new BusinessException("GitHub couldn't be reached to create the repository");
        }
    }

    @Override
    public void assertRepoAccessible(String workspaceSlug, String repoFullName) {
        // L'accès se vérifie avec le `gh` de la personne : par la coque avant de lier, par le runner au clonage.
    }

    /**
     * Vrai quand le {@code gh} de la personne est connecté et que son jeton a le droit de créer un dépôt privé. GitHub le
     * dit dans ses en-têtes ; un jeton dont il ne dit rien (un jeton à droits fins) ne se propose pas : la carte ne promet
     * que ce qui marche (R15).
     */
    @Override
    public boolean createsRepos(String workspaceSlug) {
        Optional<String> token = tokens.token(null);
        if (token.isEmpty()) return false;
        Scopes known = scopes;
        if (known != null && known.token().equals(token.get()) && Instant.now().isBefore(known.at().plus(SCOPES_KEPT))) {
            return known.canCreate();
        }
        boolean canCreate;
        try {
            List<String> said = http.exchange(USER, HttpMethod.GET, new HttpEntity<>(headers(token.get())),
                new ParameterizedTypeReference<Map<String, Object>>() {}).getHeaders().getOrEmpty(SCOPES);
            canCreate = said.stream().flatMap(value -> Arrays.stream(value.split(","))).map(String::strip).anyMatch(REPO_SCOPE::equals);
        } catch (RestClientException e) {
            log.debug("Droits du jeton GitHub non lus : {}", e.getMessage());
            return false; // GitHub injoignable : pas de promesse, et on relira à la prochaine carte
        }
        scopes = new Scopes(token.get(), canCreate, Instant.now());
        return canCreate;
    }

    /**
     * Les dépôts de la personne, les derniers où elle a poussé d'abord ; aucun quand elle n'est pas connectée à GitHub
     * sur cet ordinateur, ou que GitHub ne répond pas : la réponse libre reste.
     */
    @Override
    public List<String> recentRepos(String workspaceSlug, int limit) {
        Optional<String> token = tokens.token(null);
        if (token.isEmpty() || limit <= 0) return List.of();
        try {
            List<Map<String, Object>> repos = http.exchange(REPOS, HttpMethod.GET, new HttpEntity<>(headers(token.get())),
                new ParameterizedTypeReference<List<Map<String, Object>>>() {}).getBody();
            if (repos == null) return List.of();
            return repos.stream().map(repo -> Objects.toString(repo.get("full_name"), ""))
                .filter(GitHubRepoNames::isFullName).limit(limit).toList();
        } catch (RestClientException e) {
            log.debug("Dépôts GitHub de la personne non lus : {}", e.getMessage());
            return List.of();
        }
    }

    private static HttpHeaders headers(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        return headers;
    }
}
