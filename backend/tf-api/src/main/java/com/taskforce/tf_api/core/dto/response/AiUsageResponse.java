package com.taskforce.tf_api.core.dto.response;

/**
 * Consommation IA du mois courant + plafond de l'instance, pour un **compte** (propriétaire, agrégée sur ses
 * workspaces). {@code limitTokens = -1} → illimité (réglage par défaut, cf. {@code ai.quota.monthly-tokens-per-account}).
 */
public record AiUsageResponse(
    long usedTokens,
    long limitTokens,
    long promptTokens,
    long completionTokens,
    int requestCount,
    String period,     // 'YYYY-MM'
    String resetAt     // date ISO du 1er du mois suivant (réinitialisation)
) {}
