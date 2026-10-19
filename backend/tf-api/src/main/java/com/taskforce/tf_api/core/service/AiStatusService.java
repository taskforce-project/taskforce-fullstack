package com.taskforce.tf_api.core.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

/**
 * État de l'IA de l'instance, lu sur {@code GET /v1/status} de l'ai-service et gardé en cache 30 s.
 *
 * <p>Sert à échouer tout de suite quand l'IA n'est pas disponible (aucun fournisseur, fournisseur
 * injoignable, secret manquant) au lieu d'attendre le délai d'expiration à chaque appel, et à afficher
 * l'état « IA non configurée » dans l'interface ({@code GET /api/ai/status}).</p>
 */
@Service
@Slf4j
public class AiStatusService {

    /** État de l'IA. Les noms de modèles sont {@code null} quand l'ai-service ne répond pas. */
    public record AiStatus(boolean configured, boolean chatAvailable, String chatModel, String fastModel,
                           boolean embeddingsAvailable, String embeddingModel) {
        public static final AiStatus UNREACHABLE = new AiStatus(false, false, null, null, false, null);
    }

    private static final long TTL_MS = 30_000;

    private final RestTemplate http;
    private final ObjectMapper objectMapper;
    private final String statusUrl;
    private final String token;

    private volatile AiStatus cached;
    private volatile long cachedAt;

    public AiStatusService(ObjectMapper objectMapper,
                           @Value("${ai.service.url:http://ai-service:8000}") String serviceUrl,
                           @Value("${ai.service.token:}") String token) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2_000);
        factory.setReadTimeout(8_000); // l'ai-service sonde le fournisseur (3 s chacun, chat puis embeddings)
        this.http = new RestTemplate(factory);
        this.objectMapper = objectMapper;
        this.statusUrl = serviceUrl.replaceAll("/+$", "") + "/v1/status";
        this.token = token;
    }

    /** État courant, relu au plus toutes les 30 s. */
    public AiStatus current() {
        AiStatus snapshot = cached;
        if (snapshot != null && System.currentTimeMillis() - cachedAt < TTL_MS) {
            return snapshot;
        }
        synchronized (this) {
            if (cached == null || System.currentTimeMillis() - cachedAt >= TTL_MS) {
                cached = fetch();
                cachedAt = System.currentTimeMillis();
            }
            return cached;
        }
    }

    /** Oublie l'état en cache : le prochain appel relit l'ai-service (après un échec d'appel au modèle). */
    public void invalidate() {
        cachedAt = 0;
    }

    private AiStatus fetch() {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token == null ? "" : token);
            String raw = http.exchange(statusUrl, HttpMethod.GET, new HttpEntity<>(headers), String.class).getBody();
            JsonNode root = objectMapper.readTree(raw == null ? "{}" : raw);
            JsonNode chat = root.path("chat");
            JsonNode embeddings = root.path("embeddings");
            return new AiStatus(
                root.path("configured").asBoolean(false),
                chat.path("available").asBoolean(false),
                chat.path("model").asText(null),
                chat.path("model_fast").asText(null),
                embeddings.path("available").asBoolean(false),
                embeddings.path("model").asText(null));
        } catch (Exception ex) {
            if (token == null || token.isBlank()) {
                log.warn("AI is off: AI_SERVICE_TOKEN is not set on the backend");
            } else {
                log.warn("AI service status unavailable: {}", ex.getMessage());
            }
            return AiStatus.UNREACHABLE;
        }
    }
}
