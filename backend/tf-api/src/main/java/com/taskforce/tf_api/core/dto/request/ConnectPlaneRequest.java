package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;

/** Connexion d'un workspace Plane (auth par clé API personnelle). */
public record ConnectPlaneRequest(
    @NotBlank(message = "La clé API Plane est obligatoire") String apiKey,
    @NotBlank(message = "Le slug du workspace Plane est obligatoire") String planeWorkspace
) {}
