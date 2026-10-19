package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/** Session de l'app desktop telle que les réglages de la webapp la montrent : jamais son jeton. */
public record DesktopSessionInfoResponse(
    Long id,
    String name,
    LocalDateTime createdAt,
    LocalDateTime lastUsedAt,
    LocalDateTime expiresAt
) {}
