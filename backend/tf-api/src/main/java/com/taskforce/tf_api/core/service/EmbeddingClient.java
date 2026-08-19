package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import lombok.extern.slf4j.Slf4j;

/**
 * Client HTTP vers l'ai-service interne pour le calcul d'embeddings (POST /v1/embeddings).
 *
 * <p>Best-effort : en cas d'indisponibilité (réseau, service down), renvoie {@code null}
 * et l'appelant ignore simplement l'embedding (le node reste utilisable, juste non indexé).
 * Le service Python bascule lui-même sur un vecteur lexical déterministe 1024d si Ollama
 * (BGE-M3) est indisponible — on récupère donc toujours des vecteurs de dimension cohérente.
 */
@Component
@Slf4j
public class EmbeddingClient {

    /** Dimension attendue (BGE-M3 via Ollama). Doit matcher la colonne pgvector vector(1024) (V59). */
    public static final int DIMENSIONS = 1024;

    private final RestTemplate http;
    private final String embeddingsUrl;

    public EmbeddingClient(@Value("${ai.service.url:http://ai-service:8000}") String aiServiceUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3_000);
        factory.setReadTimeout(60_000); // 1er appel = téléchargement du modèle possible
        this.http = new RestTemplate(factory);
        this.embeddingsUrl = aiServiceUrl.replaceAll("/+$", "") + "/v1/embeddings";
    }

    /** Embedding d'un texte. Retourne null si l'ai-service est indisponible. */
    public float[] embed(String text) {
        List<float[]> all = embedBatch(List.of(text == null ? "" : text));
        return (all == null || all.isEmpty()) ? null : all.get(0);
    }

    /** Embedding par lot. Retourne null en cas d'échec (l'appelant gère gracieusement). */
    @SuppressWarnings("unchecked")
    public List<float[]> embedBatch(List<String> texts) {
        try {
            Map<String, Object> body = Map.of("texts", texts);
            Map<String, Object> resp = http.postForObject(embeddingsUrl, body, Map.class);
            if (resp == null || !(resp.get("vectors") instanceof List<?> vectors)) {
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
            log.warn("ai-service embeddings indisponible: {}", ex.getMessage());
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
