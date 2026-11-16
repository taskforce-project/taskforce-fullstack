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
    /**
     * L'issue de l'appel est la cible de la relation telle qu'elle a été posée : {@code relationType} se lit alors depuis
     * l'autre issue (« A BLOCKS B » lu depuis B dit « B est bloquée par A »), et l'écran la dit dans l'autre sens.
     */
    private boolean fromTarget;
    private UserSummaryResponse createdBy;
    private LocalDateTime createdAt;
}
