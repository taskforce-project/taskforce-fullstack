package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationDetail;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationSummary;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.MessageDto;
import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.AiMessage;
import com.taskforce.tf_api.core.repository.AiConversationRepository;
import com.taskforce.tf_api.core.repository.AiMessageRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Conversations Cortex : persistance (multi-conversation + historique), mémoire (historique injecté
 * dans le prompt) et jauge de contexte (empreinte tokens). Toutes les opérations sont bornées au
 * couple (workspace, user) du token — un utilisateur ne voit que ses conversations.
 */
@Service
@RequiredArgsConstructor
public class AiConversationService {

    private static final String DEFAULT_TITLE = "Nouvelle conversation";
    /** Nb de messages d'historique injectés dans le prompt (mémoire multi-tours, avant compression). */
    private static final int HISTORY_LIMIT = 10;
    /** Seuil (en nb de messages) au-delà duquel on compresse les anciens échanges dans un résumé. */
    private static final int COMPRESS_THRESHOLD = 12;
    /** Nb de messages récents gardés verbatim (le reste est condensé dans le résumé glissant). */
    private static final int KEEP_RECENT = 6;

    private static final String SUMMARY_SYSTEM =
        "Tu condenses l'historique d'une conversation entre un utilisateur et l'assistant Cortex. "
        + "Produis un résumé FACTUEL et compact (150 mots max) qui préserve le contexte, les faits/chiffres "
        + "donnés, les décisions prises, les préférences et les tâches en cours. Pas de salutations ni de méta.";

    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;
    private final LlmClient llm;

    // Nom de modèle passé au client LLM (ignoré par l'AI Gateway, qui impose son modèle Ollama).
    @Value("${ai.groq.assistant-model:llama-3.3-70b-versatile}")
    private String model;

    // ── Lecture ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ConversationSummary> list(Long workspaceId, Long userId) {
        return conversationRepository.findByWorkspaceIdAndUserIdOrderByUpdatedAtDesc(workspaceId, userId).stream()
            .map(c -> new ConversationSummary(
                c.getId(), c.getTitle(),
                c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null,
                messageRepository.countByConversationId(c.getId()),
                messageRepository.sumTokens(c.getId())))
            .toList();
    }

    @Transactional(readOnly = true)
    public ConversationDetail detail(Long id, Long userId) {
        AiConversation conv = requireOwned(id, userId);
        List<MessageDto> messages = messageRepository.findByConversationIdOrderByCreatedAtAsc(id).stream()
            .map(m -> new MessageDto(m.getId(), m.getRole(), m.getContent(), m.getMode(), m.getTotalTokens(),
                m.getCreatedAt() != null ? m.getCreatedAt().toString() : null))
            .toList();
        return new ConversationDetail(conv.getId(), conv.getTitle(),
            messageRepository.sumTokens(id), messages);
    }

    /**
     * Historique au format LLM [{role, content}] pour la mémoire multi-tours. Si la conversation a été
     * compressée, renvoie le <b>résumé glissant</b> (message system) suivi des messages récents (au-delà
     * du filigrane) ; sinon les {@link #HISTORY_LIMIT} derniers messages, en ordre chronologique.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> recentHistory(Long conversationId) {
        AiConversation conv = conversationRepository.findById(conversationId).orElse(null);
        String summary = conv != null ? conv.getSummary() : null;
        List<Map<String, Object>> out = new ArrayList<>();

        if (summary != null && !summary.isBlank()) {
            out.add(Map.of("role", "system",
                "content", "Résumé des échanges précédents de cette conversation : " + summary));
            long upto = conv.getSummaryUptoId() != null ? conv.getSummaryUptoId() : 0L;
            for (AiMessage m : messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(conversationId, upto)) {
                out.add(Map.of("role", m.getRole(), "content", m.getContent()));
            }
            return out;
        }

        List<AiMessage> recent = messageRepository.findByConversationIdOrderByCreatedAtDesc(
            conversationId, PageRequest.of(0, HISTORY_LIMIT));
        for (int i = recent.size() - 1; i >= 0; i--) { // rétablir l'ordre chronologique
            AiMessage m = recent.get(i);
            out.add(Map.of("role", m.getRole(), "content", m.getContent()));
        }
        return out;
    }

    /**
     * Compression de contexte : si le fil dépasse {@link #COMPRESS_THRESHOLD} messages, condense les plus
     * anciens (au-delà des {@link #KEEP_RECENT} récents gardés verbatim) dans un résumé glissant — un seul
     * appel LLM, uniquement au franchissement. Best-effort : un échec de résumé ne casse jamais le chat.
     * À appeler avant {@link #recentHistory} pour un tour donné.
     */
    @Transactional
    public void compressIfNeeded(Long conversationId) {
        if (!llm.isConfigured()) {
            return;
        }
        if (messageRepository.countByConversationId(conversationId) <= COMPRESS_THRESHOLD) {
            return;
        }
        AiConversation conv = conversationRepository.findById(conversationId).orElse(null);
        if (conv == null) {
            return;
        }
        long upto = conv.getSummaryUptoId() != null ? conv.getSummaryUptoId() : 0L;
        List<AiMessage> unsummarized =
            messageRepository.findByConversationIdAndIdGreaterThanOrderByIdAsc(conversationId, upto);
        if (unsummarized.size() <= KEEP_RECENT) {
            return; // rien de nouveau à condenser (on garde les récents verbatim)
        }
        List<AiMessage> toSummarize = unsummarized.subList(0, unsummarized.size() - KEEP_RECENT);
        try {
            String summary = llm.chatCompletion(model, SUMMARY_SYSTEM, buildSummaryPrompt(conv.getSummary(), toSummarize), false, "fast");
            if (summary != null && !summary.isBlank()) {
                conv.setSummary(summary.strip());
                conv.setSummaryUptoId(toSummarize.get(toSummarize.size() - 1).getId());
                conversationRepository.save(conv);
            }
        } catch (Exception e) {
            // Compression best-effort : on n'échoue pas le tour pour un résumé raté.
        }
    }

    /** Construit le prompt de résumé : résumé courant (à étendre) + nouveaux échanges à intégrer. */
    private static String buildSummaryPrompt(String existingSummary, List<AiMessage> messages) {
        StringBuilder sb = new StringBuilder();
        if (existingSummary != null && !existingSummary.isBlank()) {
            sb.append("Résumé actuel à mettre à jour :\n").append(existingSummary).append("\n\n");
        }
        sb.append("Nouveaux échanges à intégrer :\n");
        for (AiMessage m : messages) {
            String who = "assistant".equals(m.getRole()) ? "Cortex" : "Utilisateur";
            String c = m.getContent() != null ? m.getContent() : "";
            if (c.length() > 600) {
                c = c.substring(0, 600) + "…";
            }
            sb.append("- ").append(who).append(" : ").append(c.replace("\n", " ")).append('\n');
        }
        sb.append("\nRésumé mis à jour (150 mots max) :");
        return sb.toString();
    }

    // ── Écriture ────────────────────────────────────────────────────────────────

    @Transactional
    public AiConversation create(Long workspaceId, Long userId, String title) {
        AiConversation conv = new AiConversation();
        conv.setWorkspaceId(workspaceId);
        conv.setUserId(userId);
        conv.setTitle(title != null && !title.isBlank() ? trim(title) : DEFAULT_TITLE);
        return conversationRepository.save(conv);
    }

    /** Résout une conversation existante (bornée à l'utilisateur) ou en crée une nouvelle. */
    @Transactional
    public AiConversation getOrCreate(Long workspaceId, Long userId, Long conversationId) {
        if (conversationId != null && conversationId > 0) {
            return requireOwned(conversationId, userId);
        }
        return create(workspaceId, userId, DEFAULT_TITLE);
    }

    @Transactional
    public void delete(Long id, Long userId) {
        AiConversation conv = requireOwned(id, userId);
        conversationRepository.delete(conv); // cascade DB → messages
    }

    @Transactional
    public void appendMessage(Long conversationId, String role, String content, String mode, long tokens) {
        AiMessage m = new AiMessage();
        m.setConversationId(conversationId);
        m.setRole(role);
        m.setContent(content);
        m.setMode(mode);
        m.setTotalTokens(tokens);
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
            .orElseThrow(() -> new ResourceNotFoundException("Conversation introuvable"));
    }

    private static String trim(String s) {
        String t = s.strip().replaceAll("\\s+", " ");
        return t.length() > 80 ? t.substring(0, 80) + "…" : t;
    }
}
