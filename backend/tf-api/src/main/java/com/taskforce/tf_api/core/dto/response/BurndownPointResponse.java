package com.taskforce.tf_api.core.dto.response;

public record BurndownPointResponse(
    String day,
    long   remaining,
    long   ideal
) {}
