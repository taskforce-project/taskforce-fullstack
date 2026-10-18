package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Création d'un jeton personnel (OSS-5.1).
 *
 * @param name          nom affiché dans la liste (« Claude Code on my laptop »)
 * @param expiresInDays durée de validité en jours ; null = sans expiration
 */
public record CreatePersonalAccessTokenRequest(
    @NotBlank @Size(max = 80)
    String name,

    @Min(1) @Max(365)
    Integer expiresInDays
) {}
