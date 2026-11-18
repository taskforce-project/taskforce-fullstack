package com.taskforce.tf_api.core.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.AiMessage;
import com.taskforce.tf_api.core.repository.AiConversationRepository;
import com.taskforce.tf_api.core.repository.AiMessageRepository;
import com.taskforce.tf_api.core.repository.CortexRecordEventRepository;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.core.service.agent.TargetSystems;
import com.taskforce.tf_api.core.service.ai.ContextBudget;
import com.taskforce.tf_api.core.service.ai.ModelWindow;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Un dossier illisible ne casse jamais le tour (R204, relecture R159 de la PR #548) : à travers la vraie frontière
 * transactionnelle, les vrais services Spring sur une vraie base. Quand la lecture des gestes échoue, l'historique part
 * sans eux. Avant, l'échec de {@code CortexRecordService.acts}, qui participait à la transaction de l'appelant, la
 * marquait pour l'annulation ; {@code AiConversationService} l'attrapait, puis le commit levait
 * {@code UnexpectedRollbackException}, le défaut que corrige le commit des connexions. Les essais à base de mocks ne
 * pouvaient pas le voir.
 *
 * <p>Aucune transaction de test n'entoure l'appel ({@code NOT_SUPPORTED}) : chaque méthode ouvre la sienne et la valide.
 * Seuls les messages et les événements du dossier sont simulés.</p>
 */
@DisplayName("Un dossier illisible ne casse pas le tour, à travers la vraie transaction (R159)")
@Import({AiConversationService.class, CortexRecordService.class, TargetSystems.class, ConnectorCatalog.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ConversationActsTransactionIntegrationTest extends AbstractIntegrationTest {

    private static final UUID RECORD = UUID.fromString("00000000-0000-0000-0000-000000000159");

    @Autowired private AiConversationService service;
    @Autowired private CortexRecordService records;
    @Autowired private PlatformTransactionManager transactionManager;

    @MockitoBean private AiConversationRepository conversations;
    @MockitoBean private AiMessageRepository messages;
    @MockitoBean private CortexRecordEventRepository events;
    @MockitoBean private LlmClient llm;
    @MockitoBean private AiMeter aiMeter;

    private static AiMessage message(long id, String role, String content) {
        AiMessage message = new AiMessage();
        message.setId(id);
        message.setConversationId(1L);
        message.setRole(role);
        message.setContent(content);
        return message;
    }

    @BeforeEach
    void anUnreadableRecord() {
        AiMessage answer = message(2L, "assistant", "Le projet est créé.");
        answer.setReading(new HashMap<>(Map.of("record", RECORD.toString())));
        List<AiMessage> thread = List.of(message(1L, "user", "Crée le projet Test"), answer);
        AiConversation conversation = new AiConversation();
        conversation.setId(1L);
        when(conversations.findById(1L)).thenReturn(Optional.of(conversation));
        when(messages.findByConversationIdOrderByCreatedAtAsc(1L)).thenReturn(thread);
        when(messages.findByConversationIdAndIdGreaterThanOrderByIdAsc(1L, 0L)).thenReturn(thread);
        when(events.findByRecordIdInOrderByRecordIdAscSeqAsc(any())).thenThrow(new IllegalStateException("database down"));
    }

    @Test
    @DisplayName("ce que la conversation a fait : rien, sans casser le tour")
    void what_the_conversation_did_reads_nothing() {
        assertThat(service.threadDone(1L)).isEmpty();
    }

    @Test
    @DisplayName("la taille de la conversation : les messages, sans les gestes")
    void the_history_goes_without_the_acts() {
        List<Map<String, Object>> history = service.recentHistory(1L);

        assertThat(history).hasSize(2);
        assertThat((String) history.get(1).get("content")).isEqualTo("Le projet est créé.");
    }

    @Test
    @DisplayName("l'historique d'un tour, dans sa transaction à lui : les messages, sans les gestes")
    void the_history_of_a_turn_goes_without_the_acts() {
        ContextBudget budget = new ContextBudget(new ModelWindow("qwen3:8b", 8_192, false,
            ContextBudget.answerRoom(8_192, false)), 1_000, 0, 0, 100);

        assertThat(service.fit(1L, budget, "fast").messages()).extracting(message -> message.get("content"))
            .containsExactly("Crée le projet Test", "Le projet est créé.");
    }

    @Test
    @DisplayName("R159, second tour (H) : les gestes se lisent dans la transaction de l'appelant, sans seconde connexion, et leur échec ne l'annule pas")
    void the_acts_are_read_in_the_transaction_of_the_caller() {
        AtomicInteger suspended = new AtomicInteger();

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void suspend() {
                    suspended.incrementAndGet();
                }
            });
            assertThatThrownBy(() -> records.acts(List.of(RECORD))).isInstanceOf(IllegalStateException.class);
            assertThat(status.isRollbackOnly()).isFalse();
        });

        // Une transaction à elle (REQUIRES_NEW) suspendait celle de l'appelant, et prenait une seconde connexion.
        assertThat(suspended).hasValue(0);
    }
}
