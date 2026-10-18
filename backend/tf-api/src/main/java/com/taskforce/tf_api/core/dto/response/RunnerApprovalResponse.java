package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/** État d'une demande de validation, tel que le runner le lit jusqu'à la décision (OSS-5.4). */
public record RunnerApprovalResponse(Long approvalId, String status, LocalDateTime expiresAt) {}
