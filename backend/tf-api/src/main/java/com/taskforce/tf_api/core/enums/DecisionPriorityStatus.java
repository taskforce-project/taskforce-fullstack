package com.taskforce.tf_api.core.enums;

/**
 * Statut d'une priorité recommandée — la jambe « act » de la boucle OODA.
 *
 * <p>{@code NEW} : proposée, pas encore tranchée. {@code ACCEPTED} : transformée en issue.
 * {@code PINNED} : gardée sous les yeux sans être exécutée. {@code DISMISSED} : écartée
 * (signal négatif, conservé comme feedback).
 */
public enum DecisionPriorityStatus {
    NEW,
    ACCEPTED,
    PINNED,
    DISMISSED
}
