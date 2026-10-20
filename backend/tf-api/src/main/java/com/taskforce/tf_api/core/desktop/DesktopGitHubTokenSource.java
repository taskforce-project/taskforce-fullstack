package com.taskforce.tf_api.core.desktop;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.service.GitHubTokenSource;

import lombok.extern.slf4j.Slf4j;

/**
 * Dans l'app desktop : le jeton du compte GitHub de la personne, connecté par son GitHub CLI. La coque le lit à la
 * demande ({@code gh auth token}) et le sert au backend seul, sur 127.0.0.1, avec un jeton de service tiré à chaque
 * lancement (desktop/src/github-relay.ts). Le même pour tous les espaces de l'app : une personne, un compte GitHub.
 */
@Slf4j
@Component
@Primary
@Profile("desktop")
public class DesktopGitHubTokenSource implements GitHubTokenSource {

    /** Un jeton lu reste valable ce temps-là ; l'absence de jeton n'est jamais gardée (connexion faite entre-temps). */
    static final Duration CACHE = Duration.ofSeconds(30);

    private final String relayUrl;
    private final String relayToken;
    private final RestTemplate restTemplate;
    private volatile Cached cached;

    private record Cached(String token, Instant until) {}

    @Autowired
    public DesktopGitHubTokenSource(
        @Value("${desktop.github.url:}") String relayUrl,
        @Value("${desktop.github.token:}") String relayToken
    ) {
        this(relayUrl, relayToken, relayClient());
    }

    DesktopGitHubTokenSource(String relayUrl, String relayToken, RestTemplate restTemplate) {
        this.relayUrl = relayUrl == null ? "" : relayUrl.replaceAll("/+$", "");
        this.relayToken = relayToken == null ? "" : relayToken;
        this.restTemplate = restTemplate;
    }

    private static RestTemplate relayClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(15));
        return new RestTemplate(factory);
    }

    @Override
    public Optional<String> token(Long workspaceId) {
        if (relayUrl.isEmpty() || relayToken.isEmpty()) {
            return Optional.empty();
        }
        Cached current = cached;
        if (current != null && Instant.now().isBefore(current.until())) {
            return Optional.of(current.token());
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(relayToken);
        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(relayUrl + "/token", HttpMethod.GET,
                new HttpEntity<>(headers), new ParameterizedTypeReference<Map<String, Object>>() {});
            Map<String, Object> body = response == null ? null : response.getBody();
            Object token = body == null ? null : body.get("token");
            if (!(token instanceof String value) || value.isBlank()) {
                return Optional.empty();
            }
            cached = new Cached(value, Instant.now().plus(CACHE));
            return Optional.of(value);
        } catch (HttpClientErrorException.NotFound e) {
            cached = null;
            return Optional.empty();
        } catch (RestClientException e) {
            log.warn("Jeton GitHub de la coque illisible : {}", e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public boolean personal() {
        return true;
    }

    @Override
    public String missingHint() {
        return "Sign in to GitHub first (Settings > Agents).";
    }

    @Override
    public String refusedHint() {
        return "sign in to GitHub again in Settings > Agents";
    }

    @Override
    public String accountLabel() {
        return "your GitHub account";
    }
}
