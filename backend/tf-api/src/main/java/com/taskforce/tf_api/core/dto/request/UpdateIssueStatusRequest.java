package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateIssueStatusRequest {

    @Size(max = 50)
    private String name;

    @Size(max = 30)
    private String color;

    private Short position;

    private Boolean isDefault;
}
