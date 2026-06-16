package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import com.taskforce.tf_api.core.enums.IssuePriority;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateIssueRequest {

    @Size(max = 500)
    private String title;

    private String description;

    private Long statusId;

    private Long typeId;

    private IssuePriority priority;

    /** null = désassigner */
    private Long assigneeId;

    private Long parentId;

    private String startDate;

    private String dueDate;

    /** Position dans la colonne kanban (kanban drag & drop) */
    private Integer position;

    /** Story points : null = pas de changement ; 0 = retirer l'estimation ; >0 = valeur */
    private Integer storyPoints;

    /** null = pas de changement des labels ; liste vide = retirer tous les labels */
    private List<Long> labelIds;
}
