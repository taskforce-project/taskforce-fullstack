package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;

/** Connexion d'un workspace Plane (auth par clé API personnelle). */
public record ConnectPlaneRequest(
    @NotBlank(message = "The Plane API key is required") String apiKey,
    @NotBlank(message = "The Plane workspace slug is required") String planeWorkspace
) {}
