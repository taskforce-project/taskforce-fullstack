package com.taskforce.tf_api.core.enums;

/**
 * Fonctionnalités gatables par plan (PROD-4.4). La politique (quelle feature pour quel plan)
 * vit dans {@code PlanFeatureService} et reste facilement ajustable.
 */
public enum PlanFeature {
    AI_SMART_ASSIGN,
    AI_INSIGHTS,
    AI_ASSISTANT,
    ADVANCED_ANALYTICS,
    INTEGRATIONS,
    UNLIMITED_HISTORY
}
