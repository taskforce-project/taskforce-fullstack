package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * État d'une demande de validation, tel que le runner le lit jusqu'à la décision (OSS-5.4). {@code scope} dit la portée
 * d'un accord : {@code ONCE}, ou {@code MISSION} quand la personne l'accorde pour le reste de la mission (R46).
 */
public record RunnerApprovalResponse(Long approvalId, String status, LocalDateTime expiresAt, String scope) {}
