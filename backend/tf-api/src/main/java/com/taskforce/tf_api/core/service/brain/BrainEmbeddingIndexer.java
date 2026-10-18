package com.taskforce.tf_api.core.service.brain;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.EmbeddingClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Calcule en tâche de fond les vecteurs manquants ou périmés du Brain OS : notes nouvelles ou modifiées
 * (vecteur effacé par {@link BrainSearchService#markForReindex}), et toutes les notes quand le modèle
 * d'embeddings change. Rien ne se passe sans modèle d'embeddings disponible.
 *
 * <p>Hors de toute requête de l'utilisateur et hors transaction : chaque vecteur est écrit dans sa propre
 * transaction ({@link BrainEmbeddingWriter}). Borné à {@value #MAX_PER_RUN} notes par passage, par lots de
 * {@value #BATCH} (un modèle local est lent), un passage toutes les 30 s.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BrainEmbeddingIndexer {

    static final int BATCH = 16;
    static final int MAX_PER_RUN = 64;

    private final EmbeddingClient embeddingClient;
    private final JdbcTemplate jdbcTemplate;
    private final BrainEmbeddingWriter writer;

    @Scheduled(initialDelayString = "${brain.embeddings.initial-delay-ms:30000}",
               fixedDelayString = "${brain.embeddings.delay-ms:30000}")
    public void indexPending() {
        String model = embeddingClient.currentModel();
        if (model == null) return;

        List<Map<String, Object>> pending = jdbcTemplate.queryForList(
            "SELECT id, title, content FROM knowledge_nodes "
            + "WHERE status = 'ACTIVE' AND (embedding IS NULL OR embedding_model IS DISTINCT FROM ?) "
            + "ORDER BY id LIMIT " + MAX_PER_RUN, model);
        int written = 0;
        for (int from = 0; from < pending.size(); from += BATCH) {
            List<Map<String, Object>> batch = pending.subList(from, Math.min(from + BATCH, pending.size()));
            List<float[]> vectors = embeddingClient.embedBatch(
                batch.stream().map(r -> embeddingText((String) r.get("title"), (String) r.get("content"))).toList());
            if (vectors == null) break; // modèle indisponible : on reprendra au prochain passage
            for (int i = 0; i < batch.size(); i++) {
                Long id = ((Number) batch.get(i).get("id")).longValue();
                try {
                    writer.write(id, EmbeddingClient.toVectorLiteral(vectors.get(i)), model);
                    written++;
                } catch (Exception ex) {
                    log.warn("Could not store the embedding of node {}: {}", id, ex.getMessage());
                }
            }
        }
        if (written > 0) {
            log.info("Brain OS embeddings: {} node(s) indexed with {}", written, model);
        }
    }

    /** Texte indexé : titre et contenu, tronqués pour rester raisonnables. */
    static String embeddingText(String title, String content) {
        String combined = ((title != null ? title : "") + "\n" + (content != null ? content : "")).strip();
        return combined.length() > 4000 ? combined.substring(0, 4000) : combined;
    }
}
