package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.DiscussionCategory;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class CreateDiscussionRequest {

    @NotBlank
    @Size(max = 500)
    private String title;

    private String body;

    private DiscussionCategory category = DiscussionCategory.GENERAL;

    private List<String> tags;
}
