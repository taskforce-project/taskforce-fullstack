package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Demande de suggestion de compétences à partir d'un rôle (onboarding, étape 2).
 * Le LLM local (Qwen via l'AI Gateway) propose des tags en adéquation avec le rôle ; les compétences
 * déjà choisies sont transmises pour ne pas être re-proposées.
 */
@Data
public class SkillSuggestionRequest {

    @NotBlank(message = "Le rôle est requis pour proposer des compétences")
    @Size(max = 150, message = "Le rôle ne peut dépasser 150 caractères")
    private String role;

    @Size(max = 50, message = "50 compétences déjà sélectionnées maximum")
    private List<String> existingSkills;
}
