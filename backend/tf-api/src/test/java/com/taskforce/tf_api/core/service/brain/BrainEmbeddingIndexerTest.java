package com.taskforce.tf_api.core.service.brain;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import com.taskforce.tf_api.core.service.EmbeddingClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Réindexation en tâche de fond : rien sans modèle, lots bornés, vecteurs rangés avec le nom du modèle. */
@ExtendWith(MockitoExtension.class)
@DisplayName("BrainEmbeddingIndexer")
class BrainEmbeddingIndexerTest {

    @Mock private EmbeddingClient embeddingClient;
    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private BrainEmbeddingWriter writer;

    @InjectMocks private BrainEmbeddingIndexer indexer;

    private static List<Map<String, Object>> rows(int n) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (long i = 1; i <= n; i++) out.add(Map.of("id", i, "title", "Note " + i, "content", "body"));
        return out;
    }

    private static List<float[]> vectors(int n) {
        List<float[]> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(new float[]{0.1f});
        return out;
    }

    @Test
    @DisplayName("sans modèle d'embeddings → aucune lecture, aucune écriture")
    void nothing_without_model() {
        when(embeddingClient.currentModel()).thenReturn(null);

        indexer.indexPending();

        verifyNoInteractions(jdbcTemplate, writer);
    }

    @Test
    @DisplayName("notes en attente → vecteurs calculés par lots de 16 et rangés avec le nom du modèle")
    void indexes_in_batches() {
        when(embeddingClient.currentModel()).thenReturn("bge-m3");
        when(jdbcTemplate.queryForList(contains("embedding_model IS DISTINCT FROM"), eq("bge-m3"))).thenReturn(rows(20));
        when(embeddingClient.embedBatch(anyList())).thenAnswer(inv -> vectors(((List<?>) inv.getArgument(0)).size()));

        indexer.indexPending();

        verify(embeddingClient, times(2)).embedBatch(anyList()); // 16 puis 4
        verify(writer, times(20)).write(anyLong(), anyString(), eq("bge-m3"));
    }

    @Test
    @DisplayName("modèle indisponible en cours de route → arrêt, reprise au prochain passage")
    void stops_when_model_fails() {
        when(embeddingClient.currentModel()).thenReturn("bge-m3");
        when(jdbcTemplate.queryForList(anyString(), eq("bge-m3"))).thenReturn(rows(20));
        when(embeddingClient.embedBatch(anyList())).thenReturn(null);

        indexer.indexPending();

        verify(embeddingClient, times(1)).embedBatch(anyList());
        verify(writer, never()).write(anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("texte indexé : titre et contenu, tronqués à 4000 caractères")
    void embedding_text() {
        assertThat(BrainEmbeddingIndexer.embeddingText("Title", "Body")).isEqualTo("Title\nBody");
        assertThat(BrainEmbeddingIndexer.embeddingText(null, "x".repeat(5000))).hasSize(4000);
    }
}
