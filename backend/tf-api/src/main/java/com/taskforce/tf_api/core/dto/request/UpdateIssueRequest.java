package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.enums.IssuePriority;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateIssueRequest {

    @Size(max = 500)
    private String title;

    private String description;

    private Long statusId;

    private Long typeId;

    private IssuePriority priority;

    /** null = désassigner */
    private Long assigneeId;

    private Long parentId;

    private String startDate;

    private String dueDate;
}
