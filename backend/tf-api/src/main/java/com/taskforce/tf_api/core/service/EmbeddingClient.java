package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.extern.slf4j.Slf4j;

/**
 * Embeddings par la passerelle de modèles ({@link ModelGateway}), chez le fournisseur des vecteurs de l'instance.
 *
 * <p>Best-effort : sans modèle d'embeddings disponible, ou en cas d'échec, les méthodes renvoient
 * {@code null} ; le Brain OS passe alors à la recherche plein texte. Les vecteurs portent le nom du modèle
 * qui les a produits ({@link #currentModel()}) : on ne compare jamais des vecteurs de deux modèles.</p>
 */
@Component
@Slf4j
public class EmbeddingClient {

    /** Dimension de la colonne pgvector {@code knowledge_nodes.embedding vector(1024)} (V59). */
    public static final int DIMENSIONS = ModelGateway.EMBEDDING_DIM;

    private final ModelGateway gateway;
    private final AiStatusService status;

    public EmbeddingClient(ModelGateway gateway, AiStatusService status) {
        this.gateway = gateway;
        this.status = status;
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
    public List<float[]> embedBatch(List<String> texts) {
        AiStatusService.Snapshot snapshot = status.snapshot();
        if (!snapshot.status().embeddingsAvailable()) {
            return null;
        }
        try {
            List<float[]> vectors = gateway.embed(snapshot.settings(), snapshot.status().embeddingModel(), texts);
            return vectors.size() == texts.size() ? vectors : null;
        } catch (RuntimeException ex) {
            log.warn("Embeddings unavailable: {}", LogSafe.of(ex.getMessage()));
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
