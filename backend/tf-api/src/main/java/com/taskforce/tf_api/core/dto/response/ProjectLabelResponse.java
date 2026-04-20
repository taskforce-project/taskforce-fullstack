package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse pour un label de projet
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectLabelResponse {

    private Long id;
    private String name;
    private String color;
    private String description;
    private LocalDateTime createdAt;
}
