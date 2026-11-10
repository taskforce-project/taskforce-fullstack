package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueCommentResponse {
    private Long id;
    private UserSummaryResponse author;
    private String content;
    /** L'agent qui l'a écrit au nom de l'auteur (« qwen3:8b », « Claude Code », « Cortex ») ; null quand l'auteur l'a écrit. */
    private String via;
    /** Le modèle qui faisait parler l'agent de {@code via} (« qwen3:8b » pour Cortex, R123) ; null sinon. */
    private String model;
    private boolean isEdited;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
