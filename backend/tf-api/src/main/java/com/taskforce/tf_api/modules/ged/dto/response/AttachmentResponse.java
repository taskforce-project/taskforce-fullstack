package com.taskforce.tf_api.modules.ged.dto.response;

import java.time.LocalDateTime;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AttachmentResponse {
    private Long id;
    private Long issueId;
    private String originalName;
    private String contentType;
    private Long fileSize;
    private LocalDateTime createdAt;
    private String uploadedByName;
    /** URL pré-signée (GET) valable 1 heure */
    private String downloadUrl;
}
