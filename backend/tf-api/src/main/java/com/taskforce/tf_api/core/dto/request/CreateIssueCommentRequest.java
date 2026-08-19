package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateIssueCommentRequest {

    @NotBlank(message = "Le contenu est obligatoire")
    private String content;
}
