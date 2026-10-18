package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * Jeton personnel tel que la liste des réglages le montre : jamais sa valeur, seulement son début ({@code hint}).
 */
public record PersonalAccessTokenResponse(
    Long id,
    String name,
    String hint,
    LocalDateTime createdAt,
    LocalDateTime lastUsedAt,
    LocalDateTime expiresAt,
    boolean expired
) {}
