package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/** Passkey du compte telle que les réglages la montrent : son nom et ses dates, jamais sa clé. */
public record PasskeyResponse(String id, String label, LocalDateTime createdAt, LocalDateTime lastUsedAt) {}
