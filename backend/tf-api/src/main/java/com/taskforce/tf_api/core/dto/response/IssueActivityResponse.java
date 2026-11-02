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
    /** L'agent par qui l'action est passée (Cortex qui a préparé l'issue, l'agent d'une mission) ; null sinon. */
    private String via;
    private LocalDateTime createdAt;
}
