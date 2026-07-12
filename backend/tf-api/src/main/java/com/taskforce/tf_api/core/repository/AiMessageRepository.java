package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.AiMessage;

public interface AiMessageRepository extends JpaRepository<AiMessage, Long> {

    List<AiMessage> findByConversationIdOrderByCreatedAtAsc(Long conversationId);

    /** Derniers messages (ordre décroissant) — pour l'historique injecté dans le prompt. */
    List<AiMessage> findByConversationIdOrderByCreatedAtDesc(Long conversationId, Pageable pageable);

    /** Messages postérieurs au filigrane de résumé (id croissant = ordre chronologique). */
    List<AiMessage> findByConversationIdAndIdGreaterThanOrderByIdAsc(Long conversationId, Long id);

    int countByConversationId(Long conversationId);

    @Query("select coalesce(sum(m.totalTokens), 0) from AiMessage m where m.conversationId = :conversationId")
    long sumTokens(@Param("conversationId") Long conversationId);
}
