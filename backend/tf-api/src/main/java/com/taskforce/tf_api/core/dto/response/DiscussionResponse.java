package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import com.taskforce.tf_api.core.enums.DiscussionCategory;
import com.taskforce.tf_api.core.enums.DiscussionState;
import com.taskforce.tf_api.core.model.Discussion;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class DiscussionResponse {

    private Long id;
    private String title;
    private String body;
    private DiscussionCategory category;
    private DiscussionState state;

    private Long authorId;
    private String authorName;
    private String authorInitials;
    private String authorAvatarUrl;

    private int replyCount;
    private int reactionCount;
    private boolean isPinned;
    private boolean isLocked;

    private List<String> tags;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static DiscussionResponse from(Discussion d) {
        String displayName = d.getAuthor() != null ? d.getAuthor().getDisplayName() : "Unknown";
        String initials = buildInitials(displayName);

        List<String> tagList = d.getTags() != null && !d.getTags().isBlank()
                ? Arrays.asList(d.getTags().split(","))
                : Collections.emptyList();

        return DiscussionResponse.builder()
                .id(d.getId())
                .title(d.getTitle())
                .body(d.getBody())
                .category(d.getCategory())
                .state(d.getState())
                .authorId(d.getAuthor() != null ? d.getAuthor().getId() : null)
                .authorName(displayName)
                .authorInitials(initials)
                .authorAvatarUrl(d.getAuthor() != null ? d.getAuthor().getAvatarUrl() : null)
                .replyCount(d.getReplyCount())
                .reactionCount(d.getReactionCount())
                .isPinned(Boolean.TRUE.equals(d.getIsPinned()))
                .isLocked(Boolean.TRUE.equals(d.getIsLocked()))
                .tags(tagList)
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .build();
    }

    private static String buildInitials(String displayName) {
        if (displayName == null || displayName.isBlank()) return "?";
        String[] parts = displayName.trim().split("\\s+");
        if (parts.length == 1) return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        return (parts[0].charAt(0) + "" + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
}
