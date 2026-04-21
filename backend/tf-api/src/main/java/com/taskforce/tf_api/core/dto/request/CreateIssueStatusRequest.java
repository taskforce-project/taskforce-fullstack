package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateIssueStatusRequest {

    @NotBlank
    @Size(max = 50)
    private String name;

    @Size(max = 30)
    private String color;

    @NotBlank
    private String category; // IssueStatusCategory as string

    private Short position;
}
