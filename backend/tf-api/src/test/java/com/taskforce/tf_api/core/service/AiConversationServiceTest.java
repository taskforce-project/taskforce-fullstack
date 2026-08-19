package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.AiMessage;
import com.taskforce.tf_api.core.repository.AiConversationRepository;
import com.taskforce.tf_api.core.repository.AiMessageRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — compression / résumé glissant de {@link AiConversationService}.
 * Au-delà du seuil, les vieux messages sont condensés dans un résumé ; l'historique injecté devient
 * [résumé] + messages récents.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AiConversationService (compression)")
class AiConversationServiceTest {

    @Mock private AiConversationRepository conversationRepository;
    @Mock private AiMessageRepository messageRepository;
    @Mock private com.taskforce.tf_api.core.service.LlmClient llm;
    @Mock private AiMeter aiMeter;

    @InjectMocks private AiConversationService service;

    private static AiMessage msg(long id, String role, String content) {
        AiMessage m = new AiMessage();
        m.setId(id);
        m.setRole(role);
        m.setContent(content);
        return m;
    }

    @Test
    @DisplayName("compressIfNeeded : au-delà du seuil, condense les anciens et pose le filigrane")
    void compressIfNeeded_summarizes_over_threshold() throws Exception {
        ReflectionTestUtils.setField(service, "model", "m");
        // AiMeter en pass-through : exécute le résumé LLM sans gate ni comptage réel.
        when(aiMeter.metered(any(), any())).thenAnswer(inv -> ((AiMeter.AiCall<?>) inv.getArgument(1)).call());
        when(llm.isConfigured()).thenReturn(true);
        when(messageRepository.countByConversationId(1L)).thenReturn(13); // > seuil (12)

        AiConversation conv = new AiConversation(); // pas encore de résumé (filigrane null → 0)
        when(conversationRepository.findById(1L)).thenReturn(Optional.of(conv));

        List<AiMessage> unsummarized = new ArrayList<>();
        for (long i = 1; i <= 13; i++) {
            unsummarized.add(msg(i, i % 2 == 1 ? "user" : "assistant", "msg" + i));
        }
        when(messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(1L, 0L)).thenReturn(unsummarized);
        when(llm.chatCompletion(anyString(), anyString(), anyString(), anyBoolean(), anyString()))
            .thenReturn("Résumé compact des 7 premiers échanges.");

        service.compressIfNeeded(1L);

        // On garde les 6 récents verbatim → on résume les 7 premiers (ids 1..7) ; filigrane = 7.
        assertThat(conv.getSummary()).isEqualTo("Résumé compact des 7 premiers échanges.");
        assertThat(conv.getSummaryUptoId()).isEqualTo(7L);
        verify(conversationRepository).save(conv);
    }

    @Test
    @DisplayName("compressIfNeeded : sous le seuil → no-op (aucun appel LLM)")
    void compressIfNeeded_noop_under_threshold() {
        when(llm.isConfigured()).thenReturn(true);
        when(messageRepository.countByConversationId(1L)).thenReturn(5);

        service.compressIfNeeded(1L);

        verify(llm, never()).chatCompletion(anyString(), anyString(), anyString(), anyBoolean(), anyString());
        verify(conversationRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("compressIfNeeded : rien de neuf au-delà des récents → no-op")
    void compressIfNeeded_noop_when_nothing_new_beyond_recent() {
        ReflectionTestUtils.setField(service, "model", "m");
        when(llm.isConfigured()).thenReturn(true);
        when(messageRepository.countByConversationId(1L)).thenReturn(13);

        AiConversation conv = new AiConversation();
        conv.setSummaryUptoId(7L); // déjà résumé jusqu'à 7
        when(conversationRepository.findById(1L)).thenReturn(Optional.of(conv));
        // 6 messages non résumés = exactement KEEP_RECENT → rien à condenser
        List<AiMessage> unsummarized = new ArrayList<>();
        for (long i = 8; i <= 13; i++) {
            unsummarized.add(msg(i, "user", "msg" + i));
        }
        when(messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(1L, 7L)).thenReturn(unsummarized);

        service.compressIfNeeded(1L);

        verify(llm, never()).chatCompletion(anyString(), anyString(), anyString(), anyBoolean(), anyString());
        verify(conversationRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("recentHistory : conversation compressée → [résumé system] + messages récents")
    void recentHistory_returns_summary_then_recent() {
        AiConversation conv = new AiConversation();
        conv.setSummary("Le projet s'appelle Zephyr-7.");
        conv.setSummaryUptoId(7L);
        when(conversationRepository.findById(1L)).thenReturn(Optional.of(conv));
        when(messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(eq(1L), eq(7L)))
            .thenReturn(List.of(msg(8, "user", "Question récente"), msg(9, "assistant", "Réponse récente")));

        List<Map<String, Object>> history = service.recentHistory(1L);

        assertThat(history).hasSize(3);
        assertThat(history.get(0)).containsEntry("role", "system");
        assertThat((String) history.get(0).get("content")).contains("Zephyr-7");
        assertThat(history.get(1)).containsEntry("content", "Question récente");
        assertThat(history.get(2)).containsEntry("content", "Réponse récente");
        // Chemin résumé : on ne retombe pas sur les N derniers messages bruts.
        verify(messageRepository, never()).findByConversationIdOrderByCreatedAtDesc(anyLong(), org.mockito.ArgumentMatchers.any());
    }
}
