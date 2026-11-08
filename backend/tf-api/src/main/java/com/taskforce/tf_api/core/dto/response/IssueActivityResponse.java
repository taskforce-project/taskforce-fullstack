package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.enums.IssueActivityType;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueActivityResponse {
    private Long id;
    private UserSummaryResponse actor;
    private IssueActivityType action;
    private String oldValue;
    private String newValue;
    /** L'agent par qui l'action est passée (Cortex qui a préparé l'issue, l'agent d'une mission) ; null sinon. */
    private String via;
    /** Le modèle qui faisait parler l'agent de {@code via} (« qwen3:8b » pour Cortex, R123) ; null sinon. */
    private String model;
    private LocalDateTime createdAt;
}
