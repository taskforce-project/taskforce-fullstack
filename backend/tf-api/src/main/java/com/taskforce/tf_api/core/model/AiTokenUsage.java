package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Agrégat mensuel de consommation de tokens IA d'un <b>compte</b> (le propriétaire des workspaces —
 * une ligne par mois 'YYYY-MM'). Compté par compte et non par workspace pour que le quota ne soit pas
 * contournable en multipliant les workspaces. Incrémenté à chaque appel LLM réel (cf. {@code AiUsageService.record}).
 */
@Entity
@Table(name = "ai_token_usage")
@Getter
@Setter
@NoArgsConstructor
public class AiTokenUsage extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Compte de facturation = id du user propriétaire du workspace. */
    @Column(name = "account_id", nullable = false)
    private Long accountId;

    /** Mois de rattachement au format 'YYYY-MM'. */
    @Column(nullable = false, length = 7)
    private String period;

    @Column(name = "prompt_tokens", nullable = false)
    private long promptTokens;

    @Column(name = "completion_tokens", nullable = false)
    private long completionTokens;

    @Column(name = "total_tokens", nullable = false)
    private long totalTokens;

    @Column(name = "request_count", nullable = false)
    private int requestCount;
}
