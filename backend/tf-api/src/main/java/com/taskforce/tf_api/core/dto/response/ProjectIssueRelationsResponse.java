package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.enums.IssueRelationType;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Les liens entre les issues d'un projet, en une lecture (la vue du workflow, R166) : chaque relation telle qu'elle a été
 * posée, et chaque sous-issue avec son parent, que la liste des issues ne porte pas (elle ne liste que le premier niveau).
 * Les issues archivées n'y sont pas, comme sur le board. Chaque bout d'un lien porte de quoi le nommer : une sous-issue
 * n'est pas dans la liste des issues.
 *
 * @param relations les relations entre issues du projet, de la plus ancienne à la plus récente
 * @param subIssues les sous-issues du projet, chacune avec son parent
 */
public record ProjectIssueRelationsResponse(List<Relation> relations, List<SubIssue> subIssues) {

    /**
     * Une relation telle qu'elle a été posée, de la source vers la cible : « {@code source} BLOCKS {@code target} » se lit
     * « la source bloque la cible ».
     */
    @Schema(name = "ProjectIssueRelation")
    public record Relation(
        Long id,
        IssueRelationType relationType,
        IssueSummaryResponse source,
        IssueSummaryResponse target,
        UserSummaryResponse createdBy,
        LocalDateTime createdAt
    ) {}

    /** Une sous-issue, et l'issue dont elle dépend. */
    @Schema(name = "ProjectSubIssue")
    public record SubIssue(IssueSummaryResponse parent, IssueSummaryResponse issue) {}
}
