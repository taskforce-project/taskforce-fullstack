package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CreatePageRequest {

    @NotBlank
    @Size(max = 500)
    private String title;

    @Size(max = 10)
    private String emoji;

    private String content;
}
