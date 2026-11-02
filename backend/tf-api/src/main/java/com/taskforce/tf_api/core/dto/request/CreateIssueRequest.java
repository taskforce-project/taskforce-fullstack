package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import com.taskforce.tf_api.core.enums.IssuePriority;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateIssueRequest {

    @NotBlank(message = "The title is required")
    @Size(max = 500, message = "The title can't exceed 500 characters")
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

    /** Optionnel. Labels à rattacher dès la création (cf. ISS-01), parmi ceux du projet : un autre est ignoré. */
    private List<Long> labelIds;

    /** Optionnel : l'estimation en points ; 0 ou absent, aucune. */
    @Min(value = 0, message = "Points can't be negative")
    @Max(value = 100, message = "Points can't exceed 100")
    private Integer storyPoints;
}
