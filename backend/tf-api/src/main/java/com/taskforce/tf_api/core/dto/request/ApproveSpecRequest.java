package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotBlank;

/**
 * Approbation (human-in-the-loop) d'un brouillon de spec IA. Le client renvoie le contenu
 * <b>éventuellement édité</b> ; l'approbation persiste un node {@code SPEC} lié à l'issue.
 */
public record ApproveSpecRequest(
    @NotBlank(message = "La spec est obligatoire") String spec,
    String executionPrompt,
    List<String> breakdown,
    /** Si vrai, injecte le découpage comme checklist de l'issue (suivi d'avancement). */
    boolean addChecklist,
    /** Si vrai, écrit la spec + labels + effort + priorité sur l'issue elle-même (persistant). */
    boolean applyToIssue,
    List<String> labels,   // noms de labels (résolus vers les labels existants du projet)
    Integer storyPoints,   // effort
    String priority,       // NONE | LOW | MEDIUM | HIGH | URGENT
    String type,           // nom de type (résolu vers un type existant du projet)
    boolean autoAssign     // si vrai, choisit l'assigné via le smart-assign (Qwen)
) {}
