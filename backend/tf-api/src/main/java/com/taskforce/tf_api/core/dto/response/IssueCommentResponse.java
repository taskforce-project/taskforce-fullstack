package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueCommentResponse {
    private Long id;
    private UserSummaryResponse author;
    private String content;
    private boolean isEdited;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
