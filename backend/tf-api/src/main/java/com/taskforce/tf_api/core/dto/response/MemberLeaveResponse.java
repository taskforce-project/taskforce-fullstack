package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDate;

import com.taskforce.tf_api.core.enums.LeaveType;
import com.taskforce.tf_api.core.model.MemberLeave;

import lombok.Builder;
import lombok.Data;

/**
 * Indisponibilité d'un membre (US-006).
 */
@Data
@Builder
public class MemberLeaveResponse {

    private Long id;
    private Long userId;
    private LeaveType type;
    private LocalDate startDate;
    private LocalDate endDate;
    private String note;
    /** ISO-8601. */
    private String createdAt;

    public static MemberLeaveResponse from(MemberLeave leave) {
        return MemberLeaveResponse.builder()
            .id(leave.getId())
            .userId(leave.getUserId())
            .type(leave.getType())
            .startDate(leave.getStartDate())
            .endDate(leave.getEndDate())
            .note(leave.getNote())
            .createdAt(leave.getCreatedAt() != null ? leave.getCreatedAt().toString() : null)
            .build();
    }
}
