package com.taskforce.tf_api.core.dto.response;

import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueStatusResponse {
    private Long id;
    private String name;
    private String color;
    private IssueStatusCategory category;
    private Short position;
    private boolean isDefault;
}
