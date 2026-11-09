package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.response.AssistantAnswer;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationDetail;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationSummary;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.MessageDto;
import com.taskforce.tf_api.core.dto.response.ConversationDtos;
import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.AiMessage;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.AiConversationRepository;
import com.taskforce.tf_api.core.repository.AiMessageRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.ai.ContextBudget;
import com.taskforce.tf_api.core.service.ai.ModelWindow;
import com.taskforce.tf_api.core.service.ai.TurnHistory;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires : le contexte selon le modèle (TF-J1-13) et le résumé glissant de {@link AiConversationService}.
 * Passé environ 80 % de la fenêtre, les vieux messages sont condensés dans un résumé ; ce qui part est choisi par le budget
 * de la requête, le plus récent d'abord.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AiConversationService (compression)")
class AiConversationServiceTest {

    @Mock private AiConversationRepository conversationRepository;
    @Mock private AiMessageRepository messageRepository;
    @Mock private com.taskforce.tf_api.core.service.LlmClient llm;
    @Mock private AiMeter aiMeter;
    @Mock private ProjectRepository projectRepository;
    @org.mockito.Spy private org.springframework.transaction.support.TransactionTemplate transactionTemplate =
        new com.taskforce.tf_api.util.InlineTransactionTemplate();

    @InjectMocks private AiConversationService service;

    private static AiMessage msg(long id, String role, String content) {
        AiMessage m = new AiMessage();
        m.setId(id);
        m.setRole(role);
        m.setContent(content);
        return m;
    }

    /** Sans outils, 8 192 jetons : 6 112 pour le prompt, dont 1 100 de consignes et de demande, 5 012 pour l'historique. */
    private static ContextBudget budget(int window) {
        return new ContextBudget(new ModelWindow("qwen3:8b", window, false, ContextBudget.answerRoom(window, false)), 1_000, 0, 0, 100);
    }

    /** {@code count} messages de 3 000 caractères, environ 1 010 jetons chacun, d'identifiants 1 à {@code count}. */
    private static List<AiMessage> thread(int count) {
        List<AiMessage> messages = new ArrayList<>();
        for (long i = 1; i <= count; i++) {
            messages.add(msg(i, i % 2 == 1 ? "user" : "assistant", ("msg" + i + " ").repeat(700).substring(0, 3_000)));
        }
        return messages;
    }

    private AiConversation holding(List<AiMessage> messages) {
        AiConversation conv = new AiConversation();
        conv.setWorkspaceId(3L);
        when(conversationRepository.findById(1L)).thenReturn(Optional.of(conv));
        when(messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(1L, 0L)).thenReturn(messages);
        return conv;
    }

    @Test
    @DisplayName("fit : sous le seuil, tout part, et aucun appel au modèle")
    void fit_sends_everything_under_the_threshold() {
        when(llm.isConfigured()).thenReturn(true);
        holding(thread(4));

        TurnHistory.Fitted fitted = service.fit(1L, budget(8_192), "fast");

        assertThat(fitted.messages()).hasSize(4);
        assertThat(fitted.summarized()).isZero();
        assertThat(fitted.leftOut()).isZero();
        verify(llm, never()).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    @DisplayName("fit : passé 80 % de la fenêtre, les plus anciens se condensent, les derniers échanges restent verbatim")
    void fit_condenses_the_oldest_past_the_threshold() {
        when(llm.isConfigured()).thenReturn(true);
        AiConversation conv = holding(thread(6));
        when(llm.chatCompletion(anyString(), anyString(), anyBoolean(), anyString())).thenReturn(" Le projet s'appelle Zephyr-7. ");

        TurnHistory.Fitted fitted = service.fit(1L, budget(8_192), "fast");

        // 6 060 jetons d'historique passent le seuil ; 3 815 restent à côté du résumé, soit les 3 derniers messages.
        assertThat(conv.getSummary()).isEqualTo("Le projet s'appelle Zephyr-7.");
        assertThat(conv.getSummaryUptoId()).isEqualTo(3L);
        verify(conversationRepository).save(conv);
        assertThat(fitted.summarized()).isEqualTo(3);
        assertThat(fitted.leftOut()).isZero();
        assertThat(fitted.messages()).hasSize(4);
        assertThat(fitted.messages().get(0)).containsEntry("role", "system");
        assertThat((String) fitted.messages().get(0).get("content")).contains("Zephyr-7");
        assertThat((String) fitted.messages().get(1).get("content")).startsWith("msg4 ");
    }

    @ParameterizedTest(name = "fenêtre {0} : {1} mots")
    @CsvSource({"4096, 122", "8192, 245", "16384, 491", "32768, 983", "128000, 1000"})
    @DisplayName("fit : le résumé est proportionnel à la fenêtre, et son prompt la tient")
    void fit_summary_length_follows_the_window(int window, int words) {
        when(llm.isConfigured()).thenReturn(true);
        holding(thread(window / 1_000 + 20));
        org.mockito.ArgumentCaptor<String> system = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.ArgumentCaptor<String> prompt = org.mockito.ArgumentCaptor.forClass(String.class);
        when(llm.chatCompletion(system.capture(), prompt.capture(), anyBoolean(), anyString())).thenReturn("Résumé.");

        service.fit(1L, budget(window), "fast");

        assertThat(system.getValue()).contains(words + " words max");
        assertThat(prompt.getValue()).contains(words + " words max");
        assertThat(ContextBudget.tokens(system.getValue()) + ContextBudget.tokens(prompt.getValue())).isLessThanOrEqualTo(budget(window).capacity());
    }

    @Test
    @DisplayName("fit : un résumé raté ne casse pas le tour, l'historique est coupé pour tenir, et le compte le dit")
    void fit_cuts_when_the_summary_fails() {
        when(llm.isConfigured()).thenReturn(true);
        AiConversation conv = holding(thread(6));
        when(llm.chatCompletion(anyString(), anyString(), anyBoolean(), anyString())).thenThrow(new RuntimeException("model down"));

        TurnHistory.Fitted fitted = service.fit(1L, budget(8_192), "fast");

        assertThat(conv.getSummary()).isNull();
        assertThat(conv.getSummaryUptoId()).isNull();
        verify(conversationRepository, never()).save(any());
        assertThat(fitted.summarized()).isZero();
        assertThat(fitted.leftOut()).isEqualTo(2);
        assertThat(fitted.messages()).hasSize(4);
    }

    @Test
    @DisplayName("fit : un tour sur un modèle plus petit condense pour lui ; le suivant, plus grand, prend ce qu'il y a")
    void fit_follows_the_model_of_the_turn() {
        when(llm.isConfigured()).thenReturn(true);
        AiConversation conv = holding(thread(8));
        when(llm.chatCompletion(anyString(), anyString(), anyBoolean(), anyString())).thenReturn("Résumé.");

        // Sur un grand modèle, 8 messages tiennent sans rien condenser.
        assertThat(service.fit(1L, budget(32_768), "fast").messages()).hasSize(8);
        verify(llm, never()).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());

        // Sur un petit, ils se condensent.
        TurnHistory.Fitted small = service.fit(1L, budget(8_192), "fast");
        assertThat(small.summarized()).isEqualTo(5);
        assertThat(conv.getSummaryUptoId()).isEqualTo(5L);

        // De retour sur le grand : le résumé et ce qui suit, sans nouvel appel.
        when(messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(1L, 5L)).thenReturn(thread(8).subList(5, 8));
        TurnHistory.Fitted large = service.fit(1L, budget(32_768), "fast");
        assertThat(large.summarized()).isZero();
        assertThat(large.messages()).hasSize(4);
        verify(llm, times(1)).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    @DisplayName("fit : un résumé écrit pour un grand modèle se raccourcit pour un petit ; raté, il part amputé et le compte le dit")
    void fit_shortens_a_summary_too_long_for_a_smaller_model() {
        when(llm.isConfigured()).thenReturn(true);
        AiConversation conv = new AiConversation();
        conv.setSummary("Zephyr-7. " + "détail ".repeat(3_000));
        conv.setSummaryUptoId(7L);
        when(conversationRepository.findById(1L)).thenReturn(Optional.of(conv));
        when(messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(1L, 7L)).thenReturn(List.of());
        when(llm.chatCompletion(anyString(), anyString(), anyBoolean(), anyString())).thenThrow(new RuntimeException("down"));

        TurnHistory.Fitted fitted = service.fit(1L, budget(4_096), "fast");

        assertThat(fitted.leftOut()).isEqualTo(1);
        assertThat(fitted.messages()).singleElement().satisfies(summary -> assertThat((String) summary.get("content")).contains("Zephyr-7"));
    }

    @Test
    @DisplayName("fit : trop peu à condenser pour valoir un appel au modèle, alors que l'historique tient encore")
    void fit_waits_when_condensing_saves_little() {
        when(llm.isConfigured()).thenReturn(true);
        // Au-dessus du seuil seulement à cause de ce qui est joint : condenser deux courts messages n'y changerait rien.
        String shortMessage = "x".repeat(150);
        holding(List.of(msg(1L, "user", shortMessage), msg(2L, "assistant", shortMessage), msg(3L, "user", shortMessage)));
        ContextBudget heavy = new ContextBudget(new ModelWindow("qwen3:8b", 16_384, false, 2_048), 12_900, 0, 0, 100);

        TurnHistory.Fitted fitted = service.fit(1L, heavy, "fast");

        assertThat(fitted.messages()).hasSize(3);
        verify(llm, never()).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    @DisplayName("fit : quand ce qui est joint prend toute la place, aucun résumé ne partirait : pas d'appel au modèle")
    void fit_no_summary_when_no_room_for_history() {
        when(llm.isConfigured()).thenReturn(true);
        holding(thread(3));
        ContextBudget full = new ContextBudget(new ModelWindow("qwen3:8b", 8_192, false, 2_048), 5_012, 0, 1_000, 100);

        TurnHistory.Fitted fitted = service.fit(1L, full, "fast");

        assertThat(fitted.messages()).isEmpty();
        assertThat(fitted.leftOut()).isEqualTo(3);
        verify(llm, never()).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    @DisplayName("fit : sans IA disponible, l'historique se coupe, sans chercher à condenser")
    void fit_does_not_condense_without_ai() {
        when(llm.isConfigured()).thenReturn(false);
        holding(thread(6));

        TurnHistory.Fitted fitted = service.fit(1L, budget(8_192), "fast");

        assertThat(fitted.summarized()).isZero();
        assertThat(fitted.messages()).hasSize(4);
        assertThat(fitted.leftOut()).isEqualTo(2);
        verify(llm, never()).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    @DisplayName("fit : une conversation disparue ne part avec rien")
    void fit_nothing_without_the_conversation() {
        when(conversationRepository.findById(1L)).thenReturn(Optional.empty());

        assertThat(service.fit(1L, budget(8_192), "fast")).isEqualTo(TurnHistory.Fitted.NONE);
    }

    @Test
    @DisplayName("fit : la ligne de « /compact » ne part jamais au modèle")
    void fit_ignores_the_compact_line() {
        when(llm.isConfigured()).thenReturn(true);
        AiMessage note = msg(3L, "assistant", "Conversation compacted");
        note.setMode(AiConversationService.COMPACT_MODE);
        holding(List.of(msg(1L, "user", "Bonjour"), msg(2L, "assistant", "Salut"), note));

        assertThat(service.fit(1L, budget(8_192), "fast").messages())
            .extracting(message -> message.get("content")).containsExactly("Bonjour", "Salut");
    }

    @Test
    @DisplayName("fit : une demande qui n'a pas tenu la fenêtre reste dans le fil, sans repartir ni se condenser aux tours suivants")
    void fit_leaves_out_a_turn_that_was_not_sent() {
        when(llm.isConfigured()).thenReturn(true);
        AiMessage asked = msg(3L, "user", "x".repeat(200_000));
        asked.setMode(AssistantAnswer.NOT_SENT);
        AiMessage said = msg(4L, "assistant", "This request needs about 66,000 tokens, so it wasn't sent.");
        said.setMode(AssistantAnswer.NOT_SENT);
        holding(List.of(msg(1L, "user", "Bonjour"), msg(2L, "assistant", "Salut"), asked, said));

        assertThat(service.fit(1L, budget(8_192), "fast").messages())
            .extracting(message -> message.get("content")).containsExactly("Bonjour", "Salut");
        verify(llm, never()).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    @DisplayName("compact : à la demande, même sous le seuil, tout sauf le dernier échange, et il le dit dans la conversation")
    void compact_condenses_on_demand() throws Exception {
        when(aiMeter.metered(any(), any())).thenAnswer(inv -> ((AiMeter.AiCall<?>) inv.getArgument(1)).call());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        AiConversation conv = holding(thread(4));
        when(conversationRepository.findByIdAndUserId(1L, 7L)).thenReturn(Optional.of(conv));
        when(llm.chatCompletion(anyString(), anyString(), anyBoolean(), anyString())).thenReturn("Résumé.");

        ConversationDtos.Compaction done = service.compact(1L, 7L);

        assertThat(done.summarized()).isEqualTo(2);
        assertThat(done.summary()).isEqualTo("Résumé.");
        assertThat(done.contextWindow()).isEqualTo(16_384);
        assertThat(done.contextEstimated()).isFalse();
        assertThat(done.historyTokens()).isPositive();
        assertThat(conv.getSummary()).isEqualTo("Résumé.");
        assertThat(conv.getSummaryUptoId()).isEqualTo(2L);
        org.mockito.ArgumentCaptor<AiMessage> line = org.mockito.ArgumentCaptor.forClass(AiMessage.class);
        verify(messageRepository).save(line.capture());
        assertThat(line.getValue().getMode()).isEqualTo(AiConversationService.COMPACT_MODE);
        assertThat(line.getValue().getRole()).isEqualTo("assistant");
        assertThat(line.getValue().getReading()).containsKey("context");
        // La ligne garde le résumé : elle l'ouvre, et une conversation rouverte aussi.
        assertThat(line.getValue().getContent()).isEqualTo("Résumé.");
    }

    @Test
    @DisplayName("compact : la jauge compte ce qui reste, le résumé et ce qui n'a pas été condensé")
    void compact_says_what_is_left() throws Exception {
        when(aiMeter.metered(any(), any())).thenAnswer(inv -> ((AiMeter.AiCall<?>) inv.getArgument(1)).call());
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, true, 2_048));
        AiConversation conv = holding(List.of(msg(1L, "user", "a".repeat(3_000)), msg(2L, "assistant", "b".repeat(3_000)),
            msg(3L, "user", "Dernière demande"), msg(4L, "assistant", "Dernière réponse")));
        when(conversationRepository.findByIdAndUserId(1L, 7L)).thenReturn(Optional.of(conv));
        when(llm.chatCompletion(anyString(), anyString(), anyBoolean(), anyString())).thenReturn("Résumé court.");

        ConversationDtos.Compaction done = service.compact(1L, 7L);

        assertThat(done.historyTokens()).isBetween(1, 200); // deux mille jetons condensés, il n'en reste que quelques dizaines
        assertThat(done.contextEstimated()).isTrue();
        assertThat(done.withBaseline(1_000).contextTokens()).isEqualTo(1_000 + done.historyTokens());
    }

    @ParameterizedTest(name = "{0} messages")
    @CsvSource({"0", "1", "2"})
    @DisplayName("compact : rien à condenser au-delà du dernier échange, ni appel ni ligne")
    void compact_nothing_to_do(int count) {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        AiConversation conv = holding(thread(count));
        when(conversationRepository.findByIdAndUserId(1L, 7L)).thenReturn(Optional.of(conv));

        ConversationDtos.Compaction done = service.compact(1L, 7L);

        assertThat(done.summarized()).isZero();
        assertThat(done.withBaseline(3_000).contextTokens()).isZero(); // la jauge garde sa mesure
        verify(llm, never()).chatCompletion(anyString(), anyString(), anyBoolean(), anyString());
        verify(messageRepository, never()).save(any());
    }

    @Test
    @DisplayName("compact : la conversation d'un autre ne se compacte pas")
    void compact_requires_the_owner() {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        when(conversationRepository.findByIdAndUserId(1L, 7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.compact(1L, 7L)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("compact : sans IA, et quand le résumé échoue, rien ne change et la raison remonte")
    void compact_says_when_it_fails() throws Exception {
        when(llm.isConfigured()).thenReturn(false);
        assertThatThrownBy(() -> service.compact(1L, 7L)).isInstanceOf(BusinessException.class);

        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        AiConversation conv = holding(thread(4));
        when(conversationRepository.findByIdAndUserId(1L, 7L)).thenReturn(Optional.of(conv));
        when(aiMeter.metered(any(), any())).thenThrow(new RuntimeException("model down"));

        assertThatThrownBy(() -> service.compact(1L, 7L)).isInstanceOf(BusinessException.class);
        assertThat(conv.getSummary()).isNull();
        verify(messageRepository, never()).save(any());
    }

    @Test
    @DisplayName("compact : un modèle trop lent se dit, et rien n'a changé")
    void compact_says_why_it_failed() throws Exception {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        AiConversation conv = holding(thread(4));
        when(conversationRepository.findByIdAndUserId(1L, 7L)).thenReturn(Optional.of(conv));
        when(aiMeter.metered(any(), any())).thenThrow(new RuntimeException("down", com.taskforce.tf_api.core.service.ai.ModelProviderException
            .transport("timed out", new java.net.http.HttpTimeoutException("timed out"), java.time.Duration.ofSeconds(180))));

        assertThatThrownBy(() -> service.compact(1L, 7L)).isInstanceOf(BusinessException.class)
            .hasMessageStartingWith("Nothing changed in this conversation.")
            .hasMessageContaining("180 seconds");
    }

    @Test
    @DisplayName("compact : le quota et le frein de débit remontent tels quels, avec leur réponse HTTP")
    void compact_lets_the_quota_answer() throws Exception {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.contextWindow("fast")).thenReturn(new ModelWindow("qwen3:8b", 16_384, false, 2_048));
        AiConversation conv = holding(thread(4));
        when(conversationRepository.findByIdAndUserId(1L, 7L)).thenReturn(Optional.of(conv));
        when(aiMeter.metered(any(), any())).thenThrow(new IllegalStateException("Monthly limit reached"));

        assertThatThrownBy(() -> service.compact(1L, 7L)).isInstanceOf(IllegalStateException.class);
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
    }

    @Test
    @DisplayName("recentHistory : sans résumé, toute la conversation, sans la ligne de « /compact »")
    void recentHistory_without_a_summary() {
        AiMessage note = msg(2L, "assistant", "Conversation compacted");
        note.setMode(AiConversationService.COMPACT_MODE);
        holding(List.of(msg(1L, "user", "Bonjour"), note, msg(3L, "assistant", "Salut")));

        assertThat(service.recentHistory(1L)).extracting(message -> message.get("content")).containsExactly("Bonjour", "Salut");
    }

    @Test
    @DisplayName("recentHistory : une conversation disparue n'a pas d'historique")
    void recentHistory_empty_without_the_conversation() {
        when(conversationRepository.findById(1L)).thenReturn(Optional.empty());

        assertThat(service.recentHistory(1L)).isEmpty();
    }

    @ParameterizedTest(name = "projet à l''écran {0}, de l''espace : {1} → rangée sous {2}")
    @CsvSource(nullValues = "null", value = {
        "12,   true,  12",   // le projet ouvert, de cet espace
        "12,   false, null", // un projet d'un autre espace ne la range pas
        "null, false, null", // rien à l'écran : une conversation hors projet
    })
    @DisplayName("getOrCreate : une conversation qui commence se range sous le projet à l'écran, s'il est de l'espace (R121)")
    void getOrCreate_files_a_new_conversation_under_the_project_on_screen(Long projectId, boolean inWorkspace, Long expected) {
        if (projectId != null) {
            when(projectRepository.findByIdAndWorkspaceId(projectId, 1L))
                .thenReturn(inWorkspace ? Optional.of(new Project()) : Optional.empty());
        }
        when(conversationRepository.save(any(AiConversation.class))).thenAnswer(inv -> inv.getArgument(0));

        AiConversation conv = service.getOrCreate(1L, 7L, null, projectId);

        assertThat(conv.getProjectId()).isEqualTo(expected);
        assertThat(conv.getWorkspaceId()).isEqualTo(1L);
        assertThat(conv.getUserId()).isEqualTo(7L);
        assertThat(conv.getTitle()).isEqualTo("New conversation");
    }

    @ParameterizedTest(name = "projet à l''écran {0}")
    @CsvSource(nullValues = "null", value = {"null", "12"})
    @DisplayName("getOrCreate : une conversation qui continue garde son projet, quel que soit l'écran")
    void getOrCreate_keeps_the_project_of_an_existing_conversation(Long projectOnScreen) {
        AiConversation existing = new AiConversation();
        existing.setId(5L);
        existing.setProjectId(3L);
        when(conversationRepository.findByIdAndUserId(5L, 7L)).thenReturn(Optional.of(existing));

        AiConversation conv = service.getOrCreate(1L, 7L, 5L, projectOnScreen);

        assertThat(conv.getProjectId()).isEqualTo(3L);
        verify(conversationRepository, never()).save(any());
        verify(projectRepository, never()).findByIdAndWorkspaceId(anyLong(), anyLong());
    }

    @ParameterizedTest(name = "projet {0}")
    @CsvSource(nullValues = "null", value = {"12", "null"})
    @DisplayName("list : chaque conversation dit le projet où elle a commencé, pour la barre de gauche (R121)")
    void list_returns_the_project_of_each_conversation(Long projectId) {
        AiConversation conv = new AiConversation();
        conv.setId(5L);
        conv.setTitle("Plan the launch");
        conv.setProjectId(projectId);
        when(conversationRepository.findByWorkspaceIdAndUserIdOrderByUpdatedAtDesc(1L, 7L)).thenReturn(List.of(conv));
        when(messageRepository.countByConversationId(5L)).thenReturn(2);
        when(messageRepository.sumTokens(5L)).thenReturn(120L);

        List<ConversationSummary> summaries = service.list(1L, 7L);

        assertThat(summaries).singleElement().satisfies(summary -> {
            assertThat(summary.projectId()).isEqualTo(projectId);
            assertThat(summary.title()).isEqualTo("Plan the launch");
            assertThat(summary.messageCount()).isEqualTo(2);
            assertThat(summary.totalTokens()).isEqualTo(120L);
        });
    }

    @Test
    @DisplayName("la ligne grise (R123) : ce que le modèle a lu est gardé avec la réponse, et relu tel quel à la réouverture")
    void what_the_model_read_survives_reopening() {
        AssistantRead read = new AssistantRead(List.of(new AssistantRead.IssueRead("OPS-35", 3)),
            List.of(new AssistantRead.BoardRead("OPS", 12, "OPS-35")), List.of(new AssistantRead.ToolRead("list_issues", 2)), 4);
        org.mockito.ArgumentCaptor<AiMessage> saved = org.mockito.ArgumentCaptor.forClass(AiMessage.class);
        when(messageRepository.save(saved.capture())).thenAnswer(call -> call.getArgument(0));

        service.appendMessage(5L, "assistant", "OPS-35 is done.", "deep", 900, "qwen3:8b", read);

        AiMessage kept = saved.getValue();
        assertThat(kept.getModel()).isEqualTo("qwen3:8b");
        assertThat(kept.getReading()).containsEntry("notes", 4);
        AiConversation conv = new AiConversation();
        conv.setId(5L);
        conv.setTitle("OPS-35");
        when(conversationRepository.findByIdAndUserId(5L, 7L)).thenReturn(Optional.of(conv));
        kept.setId(11L);
        AiMessage before = msg(10L, "assistant", "Older answer");
        before.setReading(Map.of("issues", "not a list"));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(5L)).thenReturn(List.of(msg(9L, "user", "Hi"), before, kept));

        ConversationDetail detail = service.detail(5L, 7L);

        assertThat(detail.messages()).extracting(MessageDto::read).containsExactly(null, null, read);
    }
}
