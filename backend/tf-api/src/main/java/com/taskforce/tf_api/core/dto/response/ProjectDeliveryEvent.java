package com.taskforce.tf_api.core.dto.response;

/**
 * Ce que publie le topic des missions d'un projet, {@code /topic/projects.{projectId}.delivery} (R166) : qu'une mission a
 * changé. L'événement ne porte pas ce que seule la personne connectée peut savoir ({@code canDecide}) : l'écran relit la
 * mission pour cela ({@code GET .../delivery/projects/{projectId}/runs/{runId}}).
 *
 * @param type           {@code run} : son état, son résultat ou ses liens ; {@code approval} : une demande ouverte, signée,
 *                       tranchée ou échue ; {@code step} : sa chronologie a avancé, {@code step} est sa nouvelle étape
 * @param projectId      le projet
 * @param runId          la mission
 * @param issueId        son issue
 * @param status         l'état de la mission ({@code QUEUED}, {@code RUNNING}, {@code DONE}, {@code FAILED})
 * @param outcome        le geste de la personne sur son résultat, quand il y en a un
 * @param approvalId     la demande, pour {@code approval}
 * @param approvalStatus son état ({@code PENDING}, {@code ALLOWED}, {@code DENIED}, {@code EXPIRED}), pour {@code approval}
 * @param step           la nouvelle étape en cours, pour {@code step}
 */
public record ProjectDeliveryEvent(
    String type,
    Long projectId,
    Long runId,
    Long issueId,
    String status,
    String outcome,
    Long approvalId,
    String approvalStatus,
    ProjectRunResponse.Step step
) {}
