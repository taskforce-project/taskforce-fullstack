package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import com.taskforce.tf_api.core.enums.IssuePriority;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateIssueRequest {

    @NotBlank(message = "Le titre est obligatoire")
    @Size(max = 500, message = "Le titre ne peut pas dépasser 500 caractères")
    private String title;

    private String description;

    /** Optionnel — utilise le statut par défaut du projet si absent */
    private Long statusId;

    /** Optionnel — utilise le type par défaut du projet si absent */
    private Long typeId;

    private IssuePriority priority;

    private Long assigneeId;

    /** Issue parente pour créer une sous-issue */
    private Long parentId;

    private String startDate;

    private String dueDate;

    /** Optionnel — labels à rattacher dès la création (cf. ISS-01). */
    private List<Long> labelIds;
}
