package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SlackChannelRequest(
    @NotBlank @Size(max = 64)
    String channelId,

    @NotBlank @Size(max = 128)
    String channelName,

    List<String> eventTypes
) {}
