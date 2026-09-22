package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * État d'un run de délégation à un agent (TF-AGENT-DELIVERY). {@code summary}/{@code resultUrl} non nuls
 * quand DONE ; {@code error} non null quand FAILED.
 *
 * <p>{@code issueKey}, {@code issueTitle}, {@code projectId} et {@code projectName} rendent un run
 * <b>lisible et cliquable</b> hors de sa fiche d'issue (historique des délégations, canvas) : sans eux
 * l'interface ne pouvait afficher que « Issue #1080 », et n'avait pas le projet qu'exige le lien profond
 * {@code /projects/{projectId}?issue={issueId}}.</p>
 */
public record DeliveryRunResponse(
    Long id,
    Long issueId,
    String issueKey,
    String issueTitle,
    Long projectId,
    String projectName,
    String providerKey,
    String model,
    String status,
    String summary,
    String resultUrl,
    String error,
    Long startedById,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}
