package com.taskforce.tf_api.core.service;

import java.util.Map;

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

    private final GitHubTokenSource tokens;
    private final RestTemplate http;

    @Autowired
    public GitHubPullRequests(GitHubTokenSource tokens) {
        this(tokens, new RestTemplate(new JdkClientHttpRequestFactory()));
    }

    GitHubPullRequests(GitHubTokenSource tokens, RestTemplate http) {
        this.tokens = tokens;
        this.http = http;
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

    private void send(Long workspaceId, String repo, String path, HttpMethod method, Object body, String what) {
        if (!GitHubRepoNames.isFullName(repo)) throw new BusinessException("This result's repository is not a GitHub repository.");
        String token = tokens.token(workspaceId).orElseThrow(() -> new BusinessException(tokens.missingHint()));
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("Accept", "application/vnd.github+json");
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            http.exchange(API + repo + path, method, new HttpEntity<>(body, headers), String.class);
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            if (status == 405 || status == 409 || status == 422) {
                throw new BusinessException("GitHub can't " + what + " on " + repo + " right now: it may have conflicts, "
                    + "failing required checks, or be closed already. Open it on GitHub to see why.");
            }
            if (status == 401 || status == 403 || status == 404) throw new BusinessException(tokens.refusedHint());
            throw new BusinessException("GitHub refused to " + what + " (HTTP " + status + ").");
        } catch (RestClientException e) {
            throw new BusinessException("GitHub can't be reached: nothing changed. Try again in a moment.");
        }
    }
}
