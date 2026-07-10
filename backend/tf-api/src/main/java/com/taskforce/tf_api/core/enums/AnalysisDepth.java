package com.taskforce.tf_api.core.enums;

/**
 * Profondeur d'un workflow d'analyse.
 *
 * <p>{@code QUICK} : tier « fast » (8B), quelques secondes, pas de clarification.
 * {@code DEEP} : tier « deep » (14B + raisonnement), plus lent, et le modèle peut demander
 * une clarification à l'humain avant de conclure (HITL).
 */
public enum AnalysisDepth {
    QUICK,
    DEEP
}
