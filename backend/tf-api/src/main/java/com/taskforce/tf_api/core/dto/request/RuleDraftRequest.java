package com.taskforce.tf_api.core.dto.request;

import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Une règle écrite en mots par la personne (R94), pour une couche de l'espace (R157).
 *
 * @param text  la règle, en mots, telle que la personne l'a écrite
 * @param scope la couche : {@code workspace}, {@code project}, {@code process}, {@code role} ou {@code person}
 * @param ref   ce que la couche vise : l'id du projet, la clé du processus, le rôle ({@code ADMIN}, {@code MEMBER}...)
 *              ou l'id de la personne ; vide pour l'organisation
 * @param rules la traduction déjà faite, à revérifier telle quelle (après le choix d'une personne qui accorde) ; vide :
 *              TaskForce la demande au modèle de l'espace
 * @param cases les cas écrits avec la traduction, revérifiés avec elle
 */
public record RuleDraftRequest(
    @NotBlank @Size(max = 500)
    String text,
    @NotBlank @Pattern(regexp = "workspace|project|process|role|person", message = "scope must be a layer of the rules")
    String scope,
    @Size(max = 80)
    String ref,
    @Size(max = 4)
    List<Map<String, Object>> rules,
    @Size(max = 8)
    List<Map<String, Object>> cases
) {
}
