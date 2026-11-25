package com.taskforce.tf_api.core.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.extern.slf4j.Slf4j;

/**
 * Les gestes de la carte de résultat d'une mission sur GitHub (R78, séance n°13) : fusionner la pull request de
 * l'agent (« Apply »), ou la fermer et supprimer sa branche (« Discard », « Try again »). Avec le jeton que la source
 * donne pour l'espace : celui de la personne dans l'app desktop, celui de l'intégration de l'espace sur le serveur.
 * Le client du JDK, parce que fermer une pull request est un {@code PATCH}.
 */
@Slf4j
@Component
public class GitHubPullRequests {

    private static final String API = "https://api.github.com/repos/";
    private static final String USER = "https://api.github.com/user";

    /**
     * GitHub n'a pas dit ce qu'il a fait d'une demande : le délai est passé, ou l'erreur vient de lui (5xx). Un envoi a pu
     * passer quand même : le témoin ne reposte pas tout de suite un commentaire qui a pu s'écrire (R159, troisième tour, c-d).
     */
    public static class Unanswered extends BusinessException {
        public Unanswered(String message) {
            super(message);
        }
    }

    private final GitHubTokenSource tokens;
    private final RestTemplate http;

    @Autowired
    public GitHubPullRequests(GitHubTokenSource tokens) {
        this(tokens, client());
    }

    GitHubPullRequests(GitHubTokenSource tokens, RestTemplate http) {
        this.tokens = tokens;
        this.http = http;
    }

    /**
     * Un délai pour chaque appel (R159, troisième tour, c-d) : sans lui, un GitHub qui ne répond plus tenait sans fin le
     * témoin, et le passage régulier avec lui.
     */
    private static RestTemplate client() {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        factory.setReadTimeout(Duration.ofSeconds(30));
        return new RestTemplate(factory);
    }

    /** Fusionne la pull request ; une PR que GitHub ne peut pas fusionner (conflits, contrôles requis) le dit. */
    public void merge(Long workspaceId, String repo, int number) {
        send(workspaceId, repo, "/pulls/" + number + "/merge", HttpMethod.PUT, Map.of(), "merge pull request #" + number);
    }

    /** Ferme la pull request, sans la fusionner. */
    public void close(Long workspaceId, String repo, int number) {
        send(workspaceId, repo, "/pulls/" + number, HttpMethod.PATCH, Map.of("state", "closed"), "close pull request #" + number);
    }

    /** Supprime la branche de l'agent. Un échec se journalise : la pull request fermée suffit à écarter le travail. */
    public void deleteBranch(Long workspaceId, String repo, String branch) {
        if (branch == null || branch.isBlank() || branch.contains("..")) return;
        try {
            send(workspaceId, repo, "/git/refs/heads/" + branch.strip(), HttpMethod.DELETE, null, "delete the branch " + branch);
        } catch (BusinessException e) {
            log.warn("Branche {} de {} non supprimée : {}", branch, repo, e.getMessage());
        }
    }

    /**
     * Commente la pull request (le témoin du dossier d'une mission, TF-J2-7) et rend l'adresse du commentaire, ou vide
     * quand GitHub ne la donne pas. {@link Unanswered} quand GitHub n'a pas dit s'il l'a écrit.
     */
    public Optional<String> comment(Long workspaceId, String repo, int number, String body) {
        String answer = send(workspaceId, repo, "/issues/" + number + "/comments", HttpMethod.POST, Map.of("body", body),
            "comment on pull request #" + number);
        if (answer == null || answer.isBlank()) return Optional.empty();
        try {
            String url = JSON.readTree(answer).path("html_url").asText("");
            return url.startsWith("https://") ? Optional.of(url) : Optional.empty();
        } catch (JsonProcessingException e) {
            return Optional.empty();
        }
    }

    /** Au plus ce nombre de pages de cent commentaires lues pour trouver un témoin déjà écrit. */
    static final int COMMENT_PAGES = 10;

    /**
     * L'adresse du commentaire de la pull request qui porte déjà l'un de ces textes (les têtes scellées d'un dossier), ou
     * vide (R159, second tour, M-a) : avant de poster, le témoin cherche s'il l'a déjà fait, une réponse de GitHub ayant pu
     * se perdre après l'écriture. Par pages de cent, au plus {@value #COMMENT_PAGES}.
     *
     * <p>Seuls comptent les commentaires de {@code author}, le compte du jeton (R159, troisième tour, c-d) : sur un dépôt
     * public, qui cite la tête ne fait pas noter son commentaire au dossier. Et « pas trouvé » ne se dit que d'une liste lue
     * en entier : une lecture qui échoue, une réponse illisible ou plus de {@value #COMMENT_PAGES} pages pleines sont des
     * échecs, et le témoin ne poste pas sur un doute.</p>
     */
    public Optional<String> findComment(Long workspaceId, String repo, int number, List<String> texts, String author) {
        for (int page = 1; page <= COMMENT_PAGES; page++) {
            String answer = send(workspaceId, repo, "/issues/" + number + "/comments?per_page=100&page=" + page, HttpMethod.GET, null,
                "read the comments of pull request #" + number);
            JsonNode comments;
            try {
                comments = answer == null || answer.isBlank() ? null : JSON.readTree(answer);
            } catch (JsonProcessingException e) {
                comments = null;
            }
            if (comments == null || !comments.isArray()) {
                throw new BusinessException("GitHub's answer for the comments of pull request #" + number + " could not be read.");
            }
            for (JsonNode comment : comments) {
                String body = comment.path("body").asText("");
                if (author.equalsIgnoreCase(comment.path("user").path("login").asText("")) && texts.stream().anyMatch(body::contains)) {
                    String url = comment.path("html_url").asText("");
                    return Optional.of(url.startsWith("https://") ? url : "https://github.com/" + repo + "/pull/" + number);
                }
            }
            if (comments.size() < 100) return Optional.empty();
        }
        throw new BusinessException("Pull request #" + number + " has more than " + (COMMENT_PAGES * 100)
            + " comments: TaskForce could not read them all to look for its witness.");
    }

    /**
     * Le compte GitHub du jeton de l'espace ({@code login}), celui dont le témoin écrit ses commentaires : il ne cherche que
     * les siens (R159, troisième tour, c-d). Une réponse sans compte est un échec.
     */
    public String login(Long workspaceId) {
        String answer = exchange(workspaceId, USER, HttpMethod.GET, null, "read the account of its token");
        String login = "";
        try {
            login = answer == null || answer.isBlank() ? "" : JSON.readTree(answer).path("login").asText("").strip();
        } catch (JsonProcessingException e) {
            login = "";
        }
        if (login.isEmpty()) throw new BusinessException("GitHub did not say which account its token belongs to.");
        return login;
    }

    /**
     * La visibilité du dépôt telle que GitHub la donne : {@code public}, {@code private} ou {@code internal} ; vide quand
     * elle ne se lit pas (pas de jeton, GitHub injoignable, une réponse sans visibilité). Le témoin n'écrit un lien vers
     * l'instance que pour un dépôt dont on sait qu'il est privé (R159, B2).
     */
    public Optional<String> visibility(Long workspaceId, String repo) {
        try {
            String answer = send(workspaceId, repo, "", HttpMethod.GET, null, "read the repository");
            JsonNode node = answer == null || answer.isBlank() ? null : JSON.readTree(answer);
            if (node == null) return Optional.empty();
            String visibility = node.path("visibility").asText("").strip().toLowerCase(Locale.ROOT);
            if (!visibility.isEmpty()) return Optional.of(visibility);
            return node.path("private").isBoolean() ? Optional.of(node.get("private").asBoolean() ? "private" : "public") : Optional.empty();
        } catch (BusinessException | JsonProcessingException e) {
            return Optional.empty();
        }
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    private String send(Long workspaceId, String repo, String path, HttpMethod method, Object body, String what) {
        if (!GitHubRepoNames.isFullName(repo)) throw new BusinessException("This result's repository is not a GitHub repository.");
        return exchange(workspaceId, API + repo + path, method, body, what, repo);
    }

    private String exchange(Long workspaceId, String url, HttpMethod method, Object body, String what) {
        return exchange(workspaceId, url, method, body, what, null);
    }

    private String exchange(Long workspaceId, String url, HttpMethod method, Object body, String what, String repo) {
        String token = tokens.token(workspaceId).orElseThrow(() -> new BusinessException(tokens.missingHint()));
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            return http.exchange(url, method, new HttpEntity<>(body, headers), String.class).getBody();
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            if (status == 405 || status == 409 || status == 422) {
                throw new BusinessException("GitHub can't " + what + (repo == null ? "" : " on " + repo) + " right now: it may "
                    + "have conflicts, failing required checks, or be closed already. Open it on GitHub to see why.");
            }
            if (status == 401 || status == 403 || status == 404) throw new BusinessException(tokens.refusedHint());
            // Une erreur de GitHub lui-même : la demande a pu passer avant (c-d).
            if (status >= 500) throw new Unanswered("GitHub refused to " + what + " (HTTP " + status + ").");
            throw new BusinessException("GitHub refused to " + what + " (HTTP " + status + ").");
        } catch (RestClientException e) {
            // Pas de réponse : un délai passé, une connexion coupée. Ce qui est parti a pu passer (c-d).
            throw new Unanswered("GitHub can't be reached: nothing changed. Try again in a moment.");
        }
    }
}
