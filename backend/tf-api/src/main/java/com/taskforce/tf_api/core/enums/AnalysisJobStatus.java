package com.taskforce.tf_api.core.enums;

/**
 * Cycle de vie d'un workflow d'analyse.
 *
 * <pre>
 * QUEUED → RUNNING → DONE
 *              ↘ WAITING_FOR_INPUT → (réponse humaine) → RUNNING → DONE
 *              ↘ FAILED
 * </pre>
 */
public enum AnalysisJobStatus {
    QUEUED,
    RUNNING,
    /** Le modèle attend une clarification de l'humain (HITL). */
    WAITING_FOR_INPUT,
    DONE,
    FAILED;

    /** Un workflow actif occupe une place dans le dock (badge « analyses en cours »). */
    public boolean isActive() {
        return this == QUEUED || this == RUNNING || this == WAITING_FOR_INPUT;
    }
}
