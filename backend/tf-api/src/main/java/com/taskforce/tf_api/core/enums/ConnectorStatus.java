package com.taskforce.tf_api.core.enums;

/**
 * Disponibilité d'un connecteur dans le catalogue.
 * <ul>
 *   <li>{@code AVAILABLE} : connecteur implémenté (on peut se connecter/synchroniser).</li>
 *   <li>{@code PLANNED} : présent dans le pool, connecteur pas encore implémenté (roadmap).</li>
 * </ul>
 */
public enum ConnectorStatus {
    AVAILABLE,
    PLANNED
}
