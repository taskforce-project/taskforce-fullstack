package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Édite une priorité avant de l'accepter — l'humain garde la main sur la formulation
 * de l'action (et donc sur l'issue qui en découlera). Champs absents = inchangés.
 */
@Data
public class EditPriorityRequest {

    @Size(max = 500, message = "Le titre ne peut pas dépasser 500 caractères")
    private String title;

    @Size(max = 2000, message = "La justification ne peut pas dépasser 2000 caractères")
    private String rationale;
}
