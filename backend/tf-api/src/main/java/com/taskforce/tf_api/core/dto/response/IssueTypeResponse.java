package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueTypeResponse {
    private Long id;
    private String name;
    private String color;
    private String icon;
    private boolean isDefault;
}
