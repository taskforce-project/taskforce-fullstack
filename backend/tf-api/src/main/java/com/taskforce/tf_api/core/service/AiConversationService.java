package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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
    /** Nb de messages d'historique injectés dans le prompt (mémoire multi-tours). */
    private static final int HISTORY_LIMIT = 10;

    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;

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

    /** Historique récent (chronologique) au format LLM [{role, content}] — mémoire multi-tours. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> recentHistory(Long conversationId) {
        List<AiMessage> recent = messageRepository.findByConversationIdOrderByCreatedAtDesc(
            conversationId, PageRequest.of(0, HISTORY_LIMIT));
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = recent.size() - 1; i >= 0; i--) { // rétablir l'ordre chronologique
            AiMessage m = recent.get(i);
            out.add(Map.of("role", m.getRole(), "content", m.getContent()));
        }
        return out;
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
