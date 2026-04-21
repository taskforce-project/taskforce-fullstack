package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Représentation allégée d'une issue (utilisée dans parent, relations) */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueSummaryResponse {
    private Long id;
    private Integer sequenceNumber;
    private String identifier;
    private String title;
    private IssueStatusResponse status;
}
