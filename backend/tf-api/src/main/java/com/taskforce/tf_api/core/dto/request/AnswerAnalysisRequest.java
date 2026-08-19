package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Réponse de l'humain à la question du modèle (HITL) — relance le workflow suspendu. */
@Data
public class AnswerAnalysisRequest {

    @NotBlank(message = "La réponse est obligatoire")
    @Size(max = 2000, message = "La réponse ne peut pas dépasser 2000 caractères")
    private String answer;
}
