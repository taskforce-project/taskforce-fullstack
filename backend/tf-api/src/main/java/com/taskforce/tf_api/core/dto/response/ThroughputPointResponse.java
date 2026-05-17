package com.taskforce.tf_api.core.dto.response;

public record ThroughputPointResponse(
    String week,
    long   opened,
    long   resolved
) {}
