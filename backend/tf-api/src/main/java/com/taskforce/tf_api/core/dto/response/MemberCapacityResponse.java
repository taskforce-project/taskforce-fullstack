package com.taskforce.tf_api.core.dto.response;

public record MemberCapacityResponse(
    Long   userId,
    String displayName,
    String avatarUrl,
    long   openIssues
) {}
