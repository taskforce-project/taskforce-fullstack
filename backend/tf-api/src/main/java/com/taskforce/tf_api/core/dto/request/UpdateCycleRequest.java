package com.taskforce.tf_api.core.dto.request;

import java.time.LocalDate;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateCycleRequest {

    @Size(max = 255)
    private String name;

    @Size(max = 5000)
    private String description;

    private LocalDate startDate;

    private LocalDate endDate;

    /** DRAFT | ACTIVE | COMPLETED */
    private String status;
}
