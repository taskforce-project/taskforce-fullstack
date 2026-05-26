package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record WebhookRequest(
    @NotBlank @Size(max = 512)
    @Pattern(regexp = "https?://.*", message = "URL must start with http:// or https://")
    String url,

    @Size(max = 128)
    String secret,

    List<String> eventTypes
) {}
