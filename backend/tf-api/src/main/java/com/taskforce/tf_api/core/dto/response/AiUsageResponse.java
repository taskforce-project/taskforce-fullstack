package com.taskforce.tf_api.core.dto.response;

/**
 * Consommation IA du mois courant + plafond du plan, pour un **compte** (propriétaire, agrégée sur ses workspaces).
 * {@code limitTokens = -1} → illimité (plan ENTERPRISE).
 */
public record AiUsageResponse(
    String plan,
    long usedTokens,
    long limitTokens,
    long promptTokens,
    long completionTokens,
    int requestCount,
    String period,     // 'YYYY-MM'
    String resetAt     // date ISO du 1er du mois suivant (réinitialisation)
) {}
