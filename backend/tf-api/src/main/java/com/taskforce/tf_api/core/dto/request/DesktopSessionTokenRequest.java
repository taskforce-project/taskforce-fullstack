package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Jeton de session de l'app desktop, pour relire le compte ou fermer la session. */
public record DesktopSessionTokenRequest(
    @NotBlank @Size(max = 64)
    String token
) {}
