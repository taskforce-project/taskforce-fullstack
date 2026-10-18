package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateChecklistItemRequest {

    @NotBlank(message = "The content is required")
    @Size(max = 500, message = "500 characters at most")
    private String content;
}
