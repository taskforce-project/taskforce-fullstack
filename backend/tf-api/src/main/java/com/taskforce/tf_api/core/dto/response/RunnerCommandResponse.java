package com.taskforce.tf_api.core.dto.response;

import com.taskforce.tf_api.core.harness.rules.RulesBundle;

/**
 * Un ordre remis au runner (R139, R140).
 *
 * @param commandId    l'ordre, à rappeler avec son résultat
 * @param runId        la mission qu'il concerne
 * @param kind         {@code REVERT_FILE} ou {@code CORRECTION}
 * @param path         le fichier à remettre comme avant
 * @param branch       la branche de la mission
 * @param base         le commit d'où elle part : l'état « d'avant »
 * @param worktreeRun  le run qui a créé le dossier de travail
 * @param repoFullName le dépôt de la mission
 * @param rules        les règles qui jugent le geste
 * @param text         la correction tapée par la personne
 */
public record RunnerCommandResponse(
    Long commandId,
    Long runId,
    String kind,
    String path,
    String branch,
    String base,
    Long worktreeRun,
    String repoFullName,
    RulesBundle rules,
    String text
) {}
