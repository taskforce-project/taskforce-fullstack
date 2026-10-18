package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Édite une priorité avant de l'accepter — l'humain garde la main sur la formulation
 * de l'action (et donc sur l'issue qui en découlera). Champs absents = inchangés.
 */
@Data
public class EditPriorityRequest {

    @Size(max = 500, message = "The title can't exceed 500 characters")
    private String title;

    @Size(max = 2000, message = "The rationale can't exceed 2000 characters")
    private String rationale;
}
