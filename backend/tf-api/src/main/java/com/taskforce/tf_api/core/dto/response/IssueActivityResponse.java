package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.IssueActivityType;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueActivityResponse {
    private Long id;
    private UserSummaryResponse actor;
    private IssueActivityType action;
    private String oldValue;
    private String newValue;
    private LocalDateTime createdAt;
}
