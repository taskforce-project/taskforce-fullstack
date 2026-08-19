package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.taskforce.tf_api.core.model.IssueWorklog;

import lombok.Builder;
import lombok.Data;

/**
 * Entrée de temps (time tracking, BE-ISS-012).
 */
@Data
@Builder
public class WorklogResponse {

    private Long id;
    private UserSummaryResponse user;
    private int minutes;
    private String description;
    private LocalDate loggedAt;
    private LocalDateTime createdAt;

    public static WorklogResponse from(IssueWorklog w, UserSummaryResponse user) {
        return WorklogResponse.builder()
            .id(w.getId())
            .user(user)
            .minutes(w.getMinutes())
            .description(w.getDescription())
            .loggedAt(w.getLoggedAt())
            .createdAt(w.getCreatedAt())
            .build();
    }
}
