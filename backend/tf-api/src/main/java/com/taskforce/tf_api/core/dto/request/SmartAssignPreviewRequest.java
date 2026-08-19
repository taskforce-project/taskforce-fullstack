package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import com.taskforce.tf_api.core.enums.IssuePriority;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Brouillon d'issue pour une recommandation Smart Assign <b>à la création</b> (dry-run).
 * Aucune issue n'est persistée : on score les candidats à partir de ce brouillon.
 */
@Data
public class SmartAssignPreviewRequest {

    @NotBlank(message = "Le titre est requis pour une suggestion")
    @Size(max = 500)
    private String title;

    @Size(max = 10000)
    private String description;

    /** Noms de labels (pas d'id) — matchés contre les compétences des membres. */
    private List<String> labels;

    private IssuePriority priority;
}
