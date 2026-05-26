package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record WebhookResponse(
    Long id,
    String url,
    List<String> eventTypes,
    boolean active,
    LocalDateTime lastFiredAt,
    Integer lastStatus,
    LocalDateTime createdAt
) {}
