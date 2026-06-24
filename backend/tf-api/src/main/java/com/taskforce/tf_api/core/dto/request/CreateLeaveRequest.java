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

    @NotNull(message = "Le type d'indisponibilité est obligatoire")
    private LeaveType type;

    @NotNull(message = "La date de début est obligatoire")
    private LocalDate startDate;

    @NotNull(message = "La date de fin est obligatoire")
    private LocalDate endDate;

    @Size(max = 1000)
    private String note;
}
