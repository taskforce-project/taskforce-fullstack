package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record DataRequestRequest(
    @NotBlank
    @Pattern(regexp = "ACCESS|DELETION", message = "type must be ACCESS or DELETION")
    String type
) {}
