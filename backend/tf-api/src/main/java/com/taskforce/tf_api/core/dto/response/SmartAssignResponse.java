package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SmartAssignResponse {

    private SmartAssignCandidateResponse recommended;
    private List<SmartAssignCandidateResponse> alternatives;

    private String strategy;
    private boolean fallbackUsed;
}
