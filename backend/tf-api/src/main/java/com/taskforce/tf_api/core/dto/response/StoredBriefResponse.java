package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.dto.response.DecisionBrief.Snapshot;

/**
 * La « décision du jour » persistée d'un projet : même contenu que {@link DecisionBrief}, mais
 * chaque priorité porte une identité et un statut — elle est actionnable et survit au rechargement.
 */
public record StoredBriefResponse(
    Long id,
    Long projectId,
    String situation,
    List<String> risks,
    Snapshot snapshot,
    List<StoredPriorityResponse> priorities,
    String mode,             // generated | fallback
    LocalDateTime createdAt
) {}
