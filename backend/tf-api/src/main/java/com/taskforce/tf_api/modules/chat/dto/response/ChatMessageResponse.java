package com.taskforce.tf_api.modules.chat.dto.response;

import java.time.LocalDateTime;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatMessageResponse {

    private Long          id;
    private Long          channelId;
    private Long          authorId;
    private String        authorName;
    private String        authorInitials;
    private String        content;
    private Boolean       isEdited;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** Source externe du message : null = natif TaskForce ; "SLACK" = importé via le miroir. */
    private String        externalSource;
}
