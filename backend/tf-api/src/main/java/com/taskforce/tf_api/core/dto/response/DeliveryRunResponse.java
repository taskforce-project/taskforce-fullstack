package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * État d'un run de délégation à un agent (TF-AGENT-DELIVERY). {@code summary}/{@code resultUrl} non nuls
 * quand DONE ; {@code error} non null quand FAILED.
 */
public record DeliveryRunResponse(
    Long id,
    Long issueId,
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
