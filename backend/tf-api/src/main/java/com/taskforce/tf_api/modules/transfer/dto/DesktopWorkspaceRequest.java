package com.taskforce.tf_api.modules.transfer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Demande de l'app desktop sur un espace entier de la webapp : sa session ({@code tfa_}) et l'espace.
 *
 * @param token     jeton de session de l'app
 * @param workspace slug de l'espace
 */
public record DesktopWorkspaceRequest(
    @NotBlank @Size(max = 64) String token,
    @NotBlank @Size(max = 100) String workspace
) {}
