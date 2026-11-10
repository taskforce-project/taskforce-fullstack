package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * Vue d'un workflow d'analyse pour le panneau « AI Workflows ». Le plan d'étapes figé qu'elle portait
 * ({@code plan}) est retiré (TF-J1-3) : le statut dit seul où en est l'analyse.
 */
public record AnalysisJobResponse(
    Long id,
    Long projectId,
    String projectName,
    String depth,                     // QUICK | DEEP
    String status,                    // QUEUED | RUNNING | WAITING_FOR_INPUT | DONE | FAILED
    String question,                  // HITL : non nul ssi status = WAITING_FOR_INPUT
    String error,                     // non nul ssi status = FAILED
    Long briefId,                     // non nul ssi status = DONE
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}
