package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Le fournisseur d'IA que la personne choisit dans l'app desktop, tel que la coque le traduit : les variables que lit
 * un serveur ({@code AI_PROVIDER}, {@code AI_BASE_URL}, {@code AI_API_KEY}...), cf. desktop/src/ai.ts. Une variable
 * absente compte comme vide. Seuls les noms que la passerelle lit sont admis (DesktopAiService).
 */
public record DesktopAiSettingsRequest(
    @NotNull @Size(max = 32)
    Map<@NotNull @Pattern(regexp = "[A-Z][A-Z_]{1,39}") String, @NotNull @Size(max = 500) String> variables
) {
}
