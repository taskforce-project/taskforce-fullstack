package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Représentation allégée d'un utilisateur (utilisée dans les réponses d'issues, commentaires, etc.) */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSummaryResponse {
    private Long id;
    private String email;
}
