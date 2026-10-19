package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;

import lombok.extern.slf4j.Slf4j;

/**
 * Embeddings via l'ai-service ({@code POST /v1/embeddings}), authentifiés par le secret partagé.
 *
 * <p>Best-effort : sans modèle d'embeddings disponible, ou en cas d'échec, les méthodes renvoient
 * {@code null} ; le Brain OS passe alors à la recherche plein texte. Les vecteurs portent le nom du modèle
 * qui les a produits ({@link #currentModel()}) : on ne compare jamais des vecteurs de deux modèles.</p>
 */
@Component
@Slf4j
public class EmbeddingClient {

    /** Dimension de la colonne pgvector {@code knowledge_nodes.embedding vector(1024)} (V59). */
    public static final int DIMENSIONS = 1024;

    private final RestTemplate http;
    private final AiStatusService status;
    private final String embeddingsUrl;
    private final String token;

    public EmbeddingClient(AiStatusService status,
                           @Value("${ai.service.url:http://ai-service:8000}") String serviceUrl,
                           @Value("${ai.service.token:}") String token) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3_000);
        factory.setReadTimeout(60_000); // premier appel : le fournisseur peut charger le modèle
        this.http = new RestTemplate(factory);
        this.status = status;
        this.embeddingsUrl = serviceUrl.replaceAll("/+$", "") + "/v1/embeddings";
        this.token = token;
    }

    /** Vrai si un modèle d'embeddings est disponible. */
    public boolean isAvailable() {
        return status.current().embeddingsAvailable();
    }

    /** Nom du modèle d'embeddings courant, {@code null} s'il n'est pas disponible. */
    public String currentModel() {
        AiStatus s = status.current();
        return s.embeddingsAvailable() ? s.embeddingModel() : null;
    }

    /** Embedding d'un texte, {@code null} si indisponible. */
    public float[] embed(String text) {
        List<float[]> all = embedBatch(List.of(text == null ? "" : text));
        return (all == null || all.isEmpty()) ? null : all.get(0);
    }

    /** Embeddings d'un lot de textes, dans l'ordre ; {@code null} si indisponible ou en cas d'échec. */
    @SuppressWarnings("unchecked")
    public List<float[]> embedBatch(List<String> texts) {
        if (!isAvailable()) {
            return null;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(token == null ? "" : token);
            Map<String, Object> resp = http.postForObject(embeddingsUrl,
                new HttpEntity<>(Map.of("texts", texts), headers), Map.class);
            if (resp == null || !(resp.get("vectors") instanceof List<?> vectors) || vectors.size() != texts.size()) {
                return null;
            }
            return vectors.stream()
                .map(v -> {
                    List<Number> row = (List<Number>) v;
                    float[] arr = new float[row.size()];
                    for (int i = 0; i < row.size(); i++) arr[i] = row.get(i).floatValue();
                    return arr;
                })
                .toList();
        } catch (Exception ex) {
            log.warn("Embeddings unavailable: {}", ex.getMessage());
            status.invalidate();
            return null;
        }
    }

    /** Formate un vecteur en littéral pgvector : "[0.1,0.2,...]". */
    public static String toVectorLiteral(float[] vec) {
        StringBuilder sb = new StringBuilder(vec.length * 8).append('[');
        for (int i = 0; i < vec.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(vec[i]);
        }
        return sb.append(']').toString();
    }
}
