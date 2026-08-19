package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record SlackChannelResponse(
    Long id,
    String channelId,
    String channelName,
    List<String> eventTypes,
    boolean active,
    LocalDateTime createdAt
) {}
