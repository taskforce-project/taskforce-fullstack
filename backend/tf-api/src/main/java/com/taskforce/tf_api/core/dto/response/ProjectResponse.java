package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.enums.ProjectStatus;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse pour un projet
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectResponse {

    private Long id;
    private String name;
    private String identifier;
    private String description;
    private ProjectStatus status;
    private boolean isPublic;

    /** Résumé du workspace */
    private Long workspaceId;
    private String workspaceSlug;

    /** Créateur */
    private Long createdById;
    private String createdByName;

    /** Statistiques (calculées à la volée, 0 en l'absence d'issues — Étape 3) */
    private int memberCount;
    private int totalIssues;
    private int openIssues;

    /** Membres (liste courte, max 5 pour l'affichage avatar group) */
    private List<ProjectMemberResponse> members;

    /** Labels */
    private List<ProjectLabelResponse> labels;

    /** URL de l'icône/logo du projet (image uploadée ou emoji unicode) */
    private String iconUrl;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
