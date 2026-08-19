package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.CycleStatus;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CycleResponse {

    private Long          id;
    private String        name;
    private String        description;
    private LocalDate     startDate;
    private LocalDate     endDate;
    private CycleStatus   status;
    private UserSummaryResponse createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long          issueCount;
    private Long          completedCount;
}
