package com.taskforce.tf_api.core.dto.response;

public record UserSearchResult(
    Long   id,
    String email,
    String displayName,
    String avatarUrl
) {}
