package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateIssueCommentRequest {

    @NotBlank(message = "The content is required")
    private String content;
}
