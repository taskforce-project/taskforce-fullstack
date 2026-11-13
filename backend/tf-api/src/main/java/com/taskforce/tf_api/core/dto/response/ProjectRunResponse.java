package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Une mission d'un projet telle que la vue du workflow la lit (R166) : la mission comme ailleurs, son étape en cours, ses
 * liens et ses demandes encore ouvertes, en une lecture.
 *
 * @param run       la mission, comme la liste des missions de l'espace la rend : son état, son résultat, ses tests
 * @param step      son étape en cours : le dernier événement de sa chronologie ; nulle tant qu'elle n'en a pas. Les cinq
 *                  étapes de la mission (comprendre, prévoir, faire, vérifier, rendre) se lisent de toute la chronologie,
 *                  comme sur la vue du travail
 * @param links     sa branche, sa pull request, et les missions qui la reprennent ou qu'elle reprend
 * @param approvals ses demandes encore ouvertes, avec les champs de la chronologie ; {@code canDecide} dit si la personne
 *                  qui lit peut y répondre, comme les règles de l'espace en décident
 */
public record ProjectRunResponse(
    DeliveryRunResponse run,
    Step step,
    Links links,
    List<DeliveryRunActivityResponse.Approval> approvals
) {

    /** Un événement de la chronologie : son numéro d'ordre, sa sorte ({@code tool}, {@code test}...), l'outil, l'heure. */
    @Schema(name = "ProjectRunStep")
    public record Step(int seq, String kind, String tool, LocalDateTime at) {}

    /**
     * @param branch         la branche de l'agent ; absente sans changement de code
     * @param pullRequestUrl la pull request de la mission, quand son résultat en est une
     * @param followUpOf     la mission que celle-ci reprend sur la même branche (R139)
     * @param followedUpBy   la dernière mission qui reprend celle-ci, quand la personne a demandé des changements
     */
    @Schema(name = "ProjectRunLinks")
    public record Links(String branch, String pullRequestUrl, Long followUpOf, Long followedUpBy) {}
}
