package com.taskforce.tf_api.core.dto.request;

import java.time.LocalDate;

import com.taskforce.tf_api.core.enums.LeaveType;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Corps de la requête POST /api/workspaces/{slug}/members/{userId}/leaves (US-006).
 * La cohérence {@code endDate >= startDate} est vérifiée côté service.
 */
@Data
public class CreateLeaveRequest {

    @NotNull(message = "The time off type is required")
    private LeaveType type;

    @NotNull(message = "The start date is required")
    private LocalDate startDate;

    @NotNull(message = "The end date is required")
    private LocalDate endDate;

    @Size(max = 1000)
    private String note;
}
