package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.Map;

public record IntegrationStatusResponse(
    Long id,
    String provider,
    boolean connected,
    Map<String, String> meta,
    LocalDateTime connectedAt
) {}
