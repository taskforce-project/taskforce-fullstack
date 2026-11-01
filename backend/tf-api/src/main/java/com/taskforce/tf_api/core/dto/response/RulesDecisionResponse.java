package com.taskforce.tf_api.core.dto.response;

/**
 * Expérience E16 : la décision des règles pour un appel d'outil.
 *
 * @param effect      {@code allow}, {@code ask} ou {@code deny}
 * @param rule        la règle qui l'emporte, nulle quand aucune ne s'applique
 * @param reason      la raison de cette règle, telle qu'elle s'écrit pour la personne
 * @param actionClass la classe de l'action selon cette règle
 */
public record RulesDecisionResponse(String effect, String rule, String reason, String actionClass) {}
