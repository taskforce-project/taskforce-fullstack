package com.taskforce.tf_api.modules.chat.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateMessageRequest {

    @NotBlank
    @Size(max = 10000)
    private String content;
}
