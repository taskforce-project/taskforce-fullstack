package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * « What would happen? » : une action décrite en mots, à juger par les règles de l'espace (R157).
 *
 * @param text      l'action, en mots (« Claude Code changes src/accounting/ledger.ts »)
 * @param projectId le projet où elle se ferait, dont la couche s'applique ; vide pour l'espace seul
 */
public record RuleCheckRequest(
    @NotBlank @Size(max = 300)
    String text,
    Long projectId
) {
}
