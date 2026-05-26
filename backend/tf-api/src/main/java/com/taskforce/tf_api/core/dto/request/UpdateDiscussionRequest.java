package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.DiscussionCategory;
import com.taskforce.tf_api.core.enums.DiscussionState;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class UpdateDiscussionRequest {

    @Size(max = 500)
    private String title;

    private String body;

    private DiscussionCategory category;

    private DiscussionState state;

    private List<String> tags;
}
