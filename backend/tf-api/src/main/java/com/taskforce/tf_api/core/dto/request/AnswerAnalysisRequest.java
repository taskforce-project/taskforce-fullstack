package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Réponse de l'humain à la question du modèle (HITL) — relance le workflow suspendu. */
@Data
public class AnswerAnalysisRequest {

    @NotBlank(message = "The answer is required")
    @Size(max = 2000, message = "The answer can't exceed 2000 characters")
    private String answer;
}
