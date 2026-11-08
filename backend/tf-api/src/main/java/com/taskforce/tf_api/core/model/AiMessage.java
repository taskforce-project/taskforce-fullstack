package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.Map;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Un message d'une {@link AiConversation} (rôle user/assistant + contenu + tokens). */
@Entity
@Table(name = "ai_message")
@Getter
@Setter
@NoArgsConstructor
public class AiMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    /** 'user' | 'assistant'. */
    @Column(nullable = false, length = 16)
    private String role;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    /** fast | deep | fallback (côté assistant). */
    @Column(length = 16)
    private String mode;

    @Column(name = "total_tokens", nullable = false)
    private long totalTokens;

    /** Le modèle qui a écrit la réponse, tel que la passerelle l'a appelé (V117) ; null pour une demande ou un repli. */
    @Column(length = 128)
    private String model;

    /**
     * Ce que TaskForce a donné à lire au modèle pour cette réponse, compté (V120) : la ligne grise sous la réponse (R123),
     * aussi dans une conversation rouverte. La forme est celle de {@code AssistantAnswer.AssistantRead} ; null pour une
     * demande, un repli, et les messages d'avant.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> reading;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
