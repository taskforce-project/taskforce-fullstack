package com.taskforce.tf_api.core.enums;

/**
 * Type de relation entre deux issues.
 * Côté source → côté cible.
 */
public enum IssueRelationType {
    /** L'issue source bloque l'issue cible */
    BLOCKS,
    /** L'issue source est bloquée par l'issue cible (inverse de BLOCKS) */
    BLOCKED_BY,
    /** Les deux issues sont des doublons */
    DUPLICATE,
    /** L'issue source est liée à l'issue cible (relation générique) */
    RELATES_TO
}
