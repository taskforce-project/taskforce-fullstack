package com.taskforce.tf_api.core.dto.response;

/**
 * Une mission qui attend la réponse de la personne connectée (R128, séance n°19) : une ligne par mission, le nombre de
 * ses demandes encore ouvertes, et son issue. Ce que « Waiting for you » compte et liste.
 *
 * @param runId      la mission
 * @param issueId    son issue
 * @param issueKey   la clé de l'issue, « OPS-12 »
 * @param issueTitle son titre
 * @param projectId  son projet : l'adresse de l'issue dans le volet
 * @param requests   ses demandes encore ouvertes, une au moins
 */
public record DeliveryOpenApprovalResponse(
    Long runId,
    Long issueId,
    String issueKey,
    String issueTitle,
    Long projectId,
    long requests
) {
}
