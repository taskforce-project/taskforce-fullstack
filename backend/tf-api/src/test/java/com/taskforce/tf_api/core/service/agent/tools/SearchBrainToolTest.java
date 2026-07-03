package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link SearchBrainTool} (recherche sémantique Brain OS de l'agent).
 * Vérifie le formatage des résultats, le repli "aucune note", le topK par défaut et la troncature.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("SearchBrainTool")
class SearchBrainToolTest {

    @Mock private BrainSearchService search;

    private SearchBrainTool tool() { return new SearchBrainTool(search); }

    private KnowledgeNode node(String title, String content) {
        return KnowledgeNode.builder()
            .type(NodeType.DECISION).domain(NodeDomain.PROJET).title(title).content(content).build();
    }

    @Test
    @DisplayName("métadonnées : name search_brain + schema avec query requis")
    void metadata() {
        var t = tool();
        assertThat(t.name()).isEqualTo("search_brain");
        assertThat(t.description()).contains("Brain OS");
        assertThat(t.parametersSchema()).containsEntry("type", "object");
    }

    @Test
    @DisplayName("aucun résultat → message 'Aucune note pertinente trouvée.'")
    void no_result() {
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        assertThat(tool().execute(Map.of("query", "x"), new AgentContext("acme", 1L, 7L)))
            .isEqualTo("Aucune note pertinente trouvée.");
    }

    @Test
    @DisplayName("résultats formatés avec domaine, titre et extrait tronqué (>200 car)")
    void formats_hits_with_truncation() {
        String longContent = "a".repeat(250);
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt()))
            .thenReturn(List.of(node("Choix techno", longContent), node("Sans contenu", null)));

        String out = tool().execute(Map.of("query", "techno", "topK", 3), new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("Notes pertinentes").contains("Choix techno").contains("Sans contenu");
        assertThat(out).contains("…"); // contenu long tronqué
        verify(search).retrieveRelevant(eq(1L), eq("techno"), eq(3));
    }

    @Test
    @DisplayName("topK absent → défaut 5")
    void default_topk() {
        when(search.retrieveRelevant(anyLong(), anyString(), anyInt())).thenReturn(List.of());
        tool().execute(Map.of("query", "q"), new AgentContext("acme", 1L, 7L));
        verify(search).retrieveRelevant(eq(1L), eq("q"), eq(5));
    }
}
