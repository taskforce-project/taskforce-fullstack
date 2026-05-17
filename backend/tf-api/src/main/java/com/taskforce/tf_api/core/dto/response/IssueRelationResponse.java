package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.IssueRelationType;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueRelationResponse {
    private Long id;
    private IssueRelationType relationType;
    /** Issue sur laquelle on a fait l'appel */
    private IssueSummaryResponse issue;
    /** Issue liée */
    private IssueSummaryResponse relatedIssue;
    private UserSummaryResponse createdBy;
    private LocalDateTime createdAt;
}
