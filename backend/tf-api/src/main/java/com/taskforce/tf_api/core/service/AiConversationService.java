package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead;
import com.taskforce.tf_api.core.dto.response.AssistantAnswer.AssistantRead.ContextRead;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.Compaction;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationDetail;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationSummary;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.MessageDto;
import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.AiMessage;
import com.taskforce.tf_api.core.repository.AiConversationRepository;
import com.taskforce.tf_api.core.repository.AiMessageRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.service.ai.ContextBudget;
import com.taskforce.tf_api.core.service.ai.ModelFailure;
import com.taskforce.tf_api.core.service.ai.ModelWindow;
import com.taskforce.tf_api.core.service.ai.TurnHistory;
import com.taskforce.tf_api.core.service.agent.TurnProgress;
import com.taskforce.tf_api.shared.exception.AiRateLimitedException;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Conversations Cortex : persistance (multi-conversation + historique), mémoire (ce qui part avec la requête, choisi par
 * son budget en jetons) et jauge de contexte (empreinte tokens). Toutes les opérations sont bornées au
 * couple (workspace, user) du token — un utilisateur ne voit que ses conversations.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiConversationService {

    private static final String DEFAULT_TITLE = "New conversation";
    /** Ce que « /compact » laisse dans la conversation : une ligne, avec son résumé, qui ne part jamais au modèle. */
    static final String COMPACT_MODE = "compact";
    /** Le dernier échange reste toujours verbatim : une compaction ne condense pas ce qui vient d'être dit. */
    private static final int LAST_EXCHANGE = 2;
    /** Ce qu'un message apporte au prompt d'un résumé : au moins ce début, plus quand peu de messages partagent la place. */
    private static final String NOT_COMPACTED = "The model returned no summary, so nothing changed in this conversation. Try again.";
    private static final int MESSAGE_CHARS_MIN = 600;
    private static final int MESSAGE_CHARS_MAX = 4_000;

    /** Ce que le modèle a lu, gardé en JSON avec la réponse (V120), et relu tel quel. */
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> READING = new TypeReference<>() {};

    private static final String SUMMARY_SYSTEM =
        "You condense the history of a conversation between a user and the Cortex assistant. "
        + "Write a FACTUAL, compact summary (%d words max) that keeps the context, the facts and numbers "
        + "given, the names and codes as written, the decisions made, the preferences and the tasks in progress. "
        + "No greetings, no meta comments.";

    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;
    private final LlmClient llm;
    private final AiMeter aiMeter; // gate quota + comptage de la conso tokens de la compression d'historique
    private final TransactionTemplate transactionTemplate;
    private final ProjectRepository projectRepository;

    // ── Lecture ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ConversationSummary> list(Long workspaceId, Long userId) {
        return conversationRepository.findByWorkspaceIdAndUserIdOrderByUpdatedAtDesc(workspaceId, userId).stream()
            .map(c -> new ConversationSummary(
                c.getId(), c.getTitle(),
                c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null,
                messageRepository.countByConversationId(c.getId()),
                messageRepository.sumTokens(c.getId()), c.getProjectId()))
            .toList();
    }

    @Transactional(readOnly = true)
    public ConversationDetail detail(Long id, Long userId) {
        AiConversation conv = requireOwned(id, userId);
        List<MessageDto> messages = messageRepository.findByConversationIdOrderByCreatedAtAsc(id).stream()
            .map(m -> new MessageDto(m.getId(), m.getRole(), m.getContent(), m.getMode(), m.getTotalTokens(),
                m.getCreatedAt() != null ? m.getCreatedAt().toString() : null, m.getModel(), readOf(m)))
            .toList();
        return new ConversationDetail(conv.getId(), conv.getTitle(),
            messageRepository.sumTokens(id), messages);
    }

    /** Ce que TaskForce a donné à lire au modèle pour ce message ; null sans lecture gardée, ou illisible. */
    private static AssistantRead readOf(AiMessage message) {
        if (message.getReading() == null) return null;
        try {
            return JSON.convertValue(message.getReading(), AssistantRead.class);
        } catch (IllegalArgumentException unreadable) {
            return null;
        }
    }

    /**
     * La conversation telle qu'elle pèse, au format LLM [{role, content}] : le résumé glissant (message system) s'il y en a
     * un, puis tous les messages au-delà de son filigrane, en ordre chronologique. Ce n'est pas ce qui part au modèle
     * ({@link #fit}) : la taille que TaskForce compare à ce que chaque modèle a tenu dans la banque (R118).
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> recentHistory(Long conversationId) {
        Kept kept = kept(conversationId);
        if (kept == null) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        if (kept.summary() != null) {
            out.add(summaryMessage(kept.summary()));
        }
        kept.messages().forEach(message -> out.add(llmMessage(message)));
        return out;
    }

    /**
     * L'historique d'un tour, choisi par le budget de sa requête (TF-J1-13) : le résumé glissant et les messages les plus
     * récents qui tiennent, un petit modèle en garde peu, un grand beaucoup. Quand la requête passerait environ 80 % de la
     * fenêtre, les messages les plus anciens se condensent d'abord dans le résumé, un seul appel au modèle, celui de ce
     * tour ; les derniers échanges restent verbatim. Best-effort : un résumé raté ne casse jamais le tour, l'historique est
     * alors coupé pour tenir. Un modèle plus petit que le précédent condense ou coupe pour lui, un plus grand prend ce
     * qu'il y a.
     *
     * <p>Sans transaction autour de l'appel au modèle (PC-022) : une lecture courte, l'appel, une écriture courte. Il
     * s'appelle pendant le tour, sous sa capture d'usage : le résumé compte dans ses jetons, et le quota a été vérifié pour
     * lui.</p>
     */
    public TurnHistory.Fitted fit(Long conversationId, ContextBudget budget, String tier) {
        Kept kept = transactionTemplate.execute(status -> kept(conversationId));
        if (kept == null) {
            return TurnHistory.Fitted.NONE;
        }
        Condensation pending = llm.isConfigured() ? due(kept, budget) : null;
        if (pending != null) TurnProgress.say(TurnProgress.CONDENSING);
        String summary = pending == null ? null : summarized(pending, tier);
        if (summary == null) {
            return chosen(kept, budget, 0);
        }
        save(conversationId, summary, pending.uptoId());
        return chosen(new Kept(kept.workspaceId(), summary, kept.messages().subList(pending.count(), kept.messages().size())),
            budget, pending.count());
    }

    /**
     * « /compact », à la demande (TF-J1-13) : condense tout sauf le dernier échange, même sous le seuil, et le dit dans la
     * conversation par une ligne qui ne part jamais au modèle, et qui garde le résumé (TF-J1-15 : « la ca supp tout le
     * context ??? » : le fil reste entier, et la ligne montre ce que le modèle garde). Métré comme tout appel hors chat :
     * au-dessus du quota, le refus remonte ; un résumé raté dit pourquoi, et que rien n'a changé.
     *
     * @return ce qui a été condensé, le résumé et ce qu'il reste à envoyer au modèle
     */
    public Compaction compact(Long conversationId, Long userId) {
        if (!llm.isConfigured()) {
            throw new BusinessException("AI is not available on this instance.");
        }
        ModelWindow window = llm.contextWindow("fast");
        Kept kept = transactionTemplate.execute(status -> {
            requireOwned(conversationId, userId);
            return kept(conversationId);
        });
        ContextBudget budget = new ContextBudget(window == null ? ModelWindow.UNBOUNDED : window, 0, 0, 0, 0);
        Condensation pending = kept == null ? null
            : condensation(kept, budget, Math.max(0, kept.messages().size() - LAST_EXCHANGE));
        if (pending == null || pending.count() == 0) {
            return Compaction.NOTHING;
        }
        String summary;
        try {
            summary = aiMeter.metered(kept.workspaceId(),
                () -> llm.chatCompletion(summarySystem(pending.words()), pending.prompt(), false, "fast"));
        } catch (IllegalStateException | AiRateLimitedException refused) {
            throw refused; // le quota ou le frein de débit : leur réponse HTTP dit l'attente
        } catch (Exception failed) {
            log.warn("Compaction de la conversation {} impossible : {}", conversationId, LogSafe.of(failed.getMessage()));
            throw new BusinessException("Nothing changed in this conversation. " + ModelFailure.of(failed).said());
        }
        if (summary == null || summary.isBlank()) {
            throw new BusinessException(NOT_COMPACTED);
        }
        String written = summary.strip();
        save(conversationId, written, pending.uptoId());
        appendMessage(conversationId, "assistant", written, COMPACT_MODE, 0, null,
            new AssistantRead(List.of(), List.of(), List.of(), 0, new ContextRead(pending.count(), 0, 0)));
        // Ce qui partira maintenant : le résumé, et les messages que la compaction n'a pas pris.
        int[] sizes = sizes(kept.messages());
        int left = 0;
        for (int i = pending.count(); i < sizes.length; i++) {
            left += sizes[i];
        }
        return new Compaction(pending.count(), written, tokensOf(summaryMessage(written)) + left, 0,
            window == null ? null : Integer.valueOf(window.tokens()), window != null && window.estimated());
    }

    /** Ce qu'il y a à envoyer : le résumé courant, et les messages au-delà de son filigrane. */
    private record Kept(Long workspaceId, String summary, List<AiMessage> messages) {}

    /** Une compaction à faire : son prompt, sa longueur, ce qu'elle condense et le dernier message couvert (null : aucun). */
    private record Condensation(String prompt, int words, int count, Long uptoId) {}

    private Kept kept(Long conversationId) {
        AiConversation conv = conversationRepository.findById(conversationId).orElse(null);
        if (conv == null) {
            return null;
        }
        long upto = conv.getSummaryUptoId() != null ? conv.getSummaryUptoId() : 0L;
        List<AiMessage> messages = messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(conversationId, upto)
            .stream().filter(message -> !COMPACT_MODE.equals(message.getMode())).toList();
        String summary = conv.getSummary();
        return new Kept(conv.getWorkspaceId(), summary == null || summary.isBlank() ? null : summary, messages);
    }

    private static Map<String, Object> summaryMessage(String summary) {
        return Map.of("role", "system", "content", "Summary of the earlier exchanges of this conversation: " + summary);
    }

    private static Map<String, Object> llmMessage(AiMessage message) {
        return Map.of("role", message.getRole(), "content", message.getContent());
    }

    private static int tokensOf(Map<String, Object> message) {
        return ContextBudget.tokensOf(JSON, message);
    }

    private static int[] sizes(List<AiMessage> messages) {
        return messages.stream().mapToInt(message -> tokensOf(llmMessage(message))).toArray();
    }

    private static int sum(int[] sizes, int count) {
        int total = 0;
        for (int i = 0; i < count; i++) {
            total += sizes[i];
        }
        return total;
    }

    /**
     * La compaction que ce budget demande, ou {@code null} : pas de seuil passé, rien à condenser, ou trop peu pour valoir
     * un appel au modèle alors que l'historique tient encore. Un résumé devenu trop long pour ce modèle se raccourcit aussi.
     */
    private Condensation due(Kept kept, ContextBudget budget) {
        if (budget.historyRoom() == 0) {
            return null; // ce que la personne a joint prend toute la place : un résumé ne partirait pas davantage
        }
        int summary = kept.summary() == null ? 0 : tokensOf(summaryMessage(kept.summary()));
        int[] sizes = sizes(kept.messages());
        int total = summary + sum(sizes, sizes.length);
        boolean summaryTooLong = summary > budget.summaryTokens() * 2 && summary > budget.historyRoom();
        if (!budget.compactionDue(total) && !summaryTooLong) {
            return null;
        }
        int after = Math.min(summary, budget.summaryTokens());
        int verbatim = Math.max(ContextBudget.keepNewest(sizes, budget.verbatimRoom(after)),
            Math.min(LAST_EXCHANGE, ContextBudget.keepNewest(sizes, budget.historyRoom() - after)));
        int count = sizes.length - verbatim;
        boolean doesNotFit = total > budget.historyRoom();
        if (count == 0 && !summaryTooLong) {
            return null;
        }
        if (!doesNotFit && !summaryTooLong && !budget.worthCondensing(sum(sizes, count))) {
            return null;
        }
        return condensation(kept, budget, count);
    }

    /**
     * La compaction des {@code count} messages les plus anciens : son prompt tient la fenêtre du modèle, et s'il faut, le
     * résumé n'en couvre que les premiers ({@code count} le dit) ; les autres attendent, verbatim ou coupés pour ce tour.
     */
    private static Condensation condensation(Kept kept, ContextBudget budget, int count) {
        int words = budget.summaryWords();
        String ask = "\nUpdated summary (" + words + " words max):";
        int room = budget.capacity() - ContextBudget.tokensOf(JSON, summarySystem(words)) - ContextBudget.tokensOf(JSON, ask);
        StringBuilder prompt = new StringBuilder();
        if (kept.summary() != null) {
            prompt.append("Current summary to update:\n")
                .append(clipped(kept.summary(), Math.max(0, room / 2) * ContextBudget.CHARS_PER_TOKEN)).append("\n\n");
        }
        prompt.append("New exchanges to merge:\n");
        int used = ContextBudget.tokensOf(JSON, prompt.toString());
        int perMessage = Math.max(MESSAGE_CHARS_MIN, Math.min(MESSAGE_CHARS_MAX,
            Math.max(0, room - used) * ContextBudget.CHARS_PER_TOKEN / Math.max(1, count)));
        int taken = 0;
        Long uptoId = null;
        for (AiMessage message : kept.messages().subList(0, count)) {
            String line = summaryLine(message, perMessage);
            used += ContextBudget.tokensOf(JSON, line);
            if (used > room) {
                break;
            }
            prompt.append(line);
            taken++;
            uptoId = message.getId();
        }
        if (taken == 0 && kept.summary() == null) {
            return null;
        }
        return new Condensation(prompt.append(ask).toString(), words, taken, uptoId);
    }

    private static String summarySystem(int words) {
        return String.format(Locale.ROOT, SUMMARY_SYSTEM, words);
    }

    /** Une ligne du prompt de résumé : qui parle, et le début de ce qu'il a dit. */
    private static String summaryLine(AiMessage message, int chars) {
        String who = "assistant".equals(message.getRole()) ? "Cortex" : "User";
        String content = message.getContent() != null ? message.getContent() : "";
        return "- " + who + ": " + clipped(content, chars).replace("\n", " ") + "\n";
    }

    private static String clipped(String text, int chars) {
        return text.length() > chars ? text.substring(0, chars) + "…" : text;
    }

    /** Le résumé d'un tour : pour un palier qui raisonne, sans raisonner ; {@code null} s'il est raté (best-effort). */
    private String summarized(Condensation pending, String tier) {
        try {
            String written = llm.chatCompletion(summarySystem(pending.words()), pending.prompt(), false,
                "fast".equals(tier) ? "fast" : "standard");
            return written == null || written.isBlank() ? null : written.strip();
        } catch (RuntimeException failed) {
            log.warn("Résumé de la conversation raté, l'historique sera coupé pour tenir : {}", LogSafe.of(failed.getMessage()));
            return null;
        }
    }

    private void save(Long conversationId, String summary, Long uptoId) {
        transactionTemplate.executeWithoutResult(status ->
            conversationRepository.findById(conversationId).ifPresent(conv -> {
                conv.setSummary(summary);
                if (uptoId != null) {
                    conv.setSummaryUptoId(uptoId);
                }
                conversationRepository.save(conv);
            }));
    }

    /**
     * Ce qui part : le résumé puis les messages les plus récents qui tiennent, et ce qui n'a pas pu partir. Un résumé trop
     * long pour ce modèle (un plus grand l'a écrit, et le raccourcir a raté) part amputé de sa fin.
     */
    private static TurnHistory.Fitted chosen(Kept kept, ContextBudget budget, int summarized) {
        List<Map<String, Object>> out = new ArrayList<>();
        int room = budget.historyRoom();
        int leftOut = 0;
        if (kept.summary() != null) {
            Map<String, Object> summary = summaryMessage(kept.summary());
            int size = tokensOf(summary);
            if (size > room) {
                summary = summaryMessage(clipped(kept.summary(), room * ContextBudget.CHARS_PER_TOKEN / 2));
                size = tokensOf(summary);
                leftOut++;
            }
            if (size <= room) {
                out.add(summary);
                room -= size;
            }
        }
        int[] sizes = sizes(kept.messages());
        int keep = ContextBudget.keepNewest(sizes, room);
        kept.messages().subList(sizes.length - keep, sizes.length).forEach(message -> out.add(llmMessage(message)));
        return new TurnHistory.Fitted(out, summarized, leftOut + sizes.length - keep);
    }

    // ── Écriture ────────────────────────────────────────────────────────────────

    /** {@code projectId} : le projet à l'écran (R114), gardé seulement s'il est de cet espace ; null sinon. */
    @Transactional
    public AiConversation create(Long workspaceId, Long userId, String title, Long projectId) {
        AiConversation conv = new AiConversation();
        conv.setWorkspaceId(workspaceId);
        conv.setUserId(userId);
        conv.setTitle(title != null && !title.isBlank() ? trim(title) : DEFAULT_TITLE);
        if (projectId != null && projectRepository.findByIdAndWorkspaceId(projectId, workspaceId).isPresent()) {
            conv.setProjectId(projectId);
        }
        return conversationRepository.save(conv);
    }

    /**
     * Résout une conversation existante (bornée à l'utilisateur) ou en crée une nouvelle, rangée sous le projet à l'écran
     * quand elle commence (R121) ; une conversation existante garde le sien.
     */
    @Transactional
    public AiConversation getOrCreate(Long workspaceId, Long userId, Long conversationId, Long projectId) {
        if (conversationId != null && conversationId > 0) {
            return requireOwned(conversationId, userId);
        }
        return create(workspaceId, userId, DEFAULT_TITLE, projectId);
    }

    @Transactional
    public void delete(Long id, Long userId) {
        AiConversation conv = requireOwned(id, userId);
        conversationRepository.delete(conv); // cascade DB → messages
    }

    @Transactional
    public void appendMessage(Long conversationId, String role, String content, String mode, long tokens) {
        appendMessage(conversationId, role, content, mode, tokens, null);
    }

    /** Un message, avec le modèle qui a écrit la réponse (null pour une demande ou un repli). */
    @Transactional
    public void appendMessage(Long conversationId, String role, String content, String mode, long tokens, String model) {
        appendMessage(conversationId, role, content, mode, tokens, model, null);
    }

    /**
     * Un message, avec le modèle qui a écrit la réponse et ce que TaskForce lui a donné à lire (la ligne grise, R123) ;
     * null pour une demande ou un repli.
     */
    @Transactional
    public void appendMessage(Long conversationId, String role, String content, String mode, long tokens, String model,
                              AssistantRead read) {
        AiMessage m = new AiMessage();
        m.setReading(read == null ? null : JSON.convertValue(read, READING));
        m.setConversationId(conversationId);
        m.setRole(role);
        m.setContent(content);
        m.setMode(mode);
        m.setTotalTokens(tokens);
        m.setModel(model == null || model.isBlank() ? null : model.length() > 128 ? model.substring(0, 128) : model);
        messageRepository.save(m);
        // Remonte la conversation en tête de liste.
        conversationRepository.findById(conversationId).ifPresent(c -> {
            c.setUpdatedAt(LocalDateTime.now());
            conversationRepository.save(c);
        });
    }

    /** Titre auto depuis le 1er message utilisateur (si la conversation a encore le titre par défaut). Renvoie le titre final. */
    @Transactional
    public String autoTitle(Long conversationId, String firstUserMessage) {
        AiConversation c = conversationRepository.findById(conversationId).orElse(null);
        if (c == null) return null;
        if (DEFAULT_TITLE.equals(c.getTitle()) && firstUserMessage != null && !firstUserMessage.isBlank()) {
            c.setTitle(trim(firstUserMessage));
            conversationRepository.save(c);
        }
        return c.getTitle();
    }

    private AiConversation requireOwned(Long id, Long userId) {
        return conversationRepository.findByIdAndUserId(id, userId)
            .orElseThrow(() -> new ResourceNotFoundException("Conversation not found"));
    }

    private static String trim(String s) {
        String t = s.strip().replaceAll("\\s+", " ");
        return t.length() > 80 ? t.substring(0, 80) + "…" : t;
    }
}
