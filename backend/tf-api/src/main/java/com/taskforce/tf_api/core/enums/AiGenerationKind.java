package com.taskforce.tf_api.core.enums;

/**
 * Type de generation IA capturee dans le data flywheel ({@code ai_generations}).
 *
 * <p>Stocke en {@code VARCHAR} (pas d'enum SQL ni de contrainte CHECK) : ajouter une valeur ne
 * demande donc AUCUNE migration - c'est le point d'extension prevu pour la V2 (ex. un futur
 * {@code EXECUTION} capturant l'outcome d'un agent qui implemente la tache).
 *
 * <ul>
 *   <li>{@code SPEC} - specification d'issue (draft -> final approuve) ;</li>
 *   <li>{@code DECISION} - priorite OODA acceptee/editee/ecartee -> issue ;</li>
 *   <li>{@code SMART_ASSIGN} - reco d'assignation (top-1) vs assigne reel.</li>
 * </ul>
 */
public enum AiGenerationKind {
    SPEC,
    DECISION,
    SMART_ASSIGN
}
