package com.taskforce.tf_api.modules.chat.repository;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.modules.chat.domain.ChatMessage;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    /**
     * Derniers N messages non-supprimés d'un canal, triés par date asc.
     */
    @Query("""
        SELECT m FROM ChatMessage m
        LEFT JOIN FETCH m.author
        WHERE m.channel.id = :channelId
          AND m.isDeleted = false
        ORDER BY m.createdAt ASC
        """)
    List<ChatMessage> findRecentByChannel(@Param("channelId") Long channelId,
                                          Pageable pageable);
}
