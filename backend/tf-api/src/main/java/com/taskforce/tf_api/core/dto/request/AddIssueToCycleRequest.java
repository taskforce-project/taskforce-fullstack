package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AddIssueToCycleRequest {

    @NotNull
    private Long issueId;
}
