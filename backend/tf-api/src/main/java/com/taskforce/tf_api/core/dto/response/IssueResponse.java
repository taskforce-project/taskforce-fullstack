package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.enums.IssuePriority;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueResponse {
    private Long id;

    /** ex: 42 */
    private Integer sequenceNumber;

    /** ex: "WEB-42" */
    private String identifier;

    private String title;
    private String description;
    private IssuePriority priority;
    private IssueStatusResponse status;
    private IssueTypeResponse type;

    private UserSummaryResponse assignee;
    private UserSummaryResponse reporter;

    /** null si issue de premier niveau */
    private IssueSummaryResponse parent;
    private int childCount;

    private LocalDate startDate;
    private LocalDate dueDate;
    private LocalDateTime completedAt;

    private List<ProjectLabelResponse> labels;

    private int commentCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
