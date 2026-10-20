package com.taskforce.tf_api.modules.transfer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Demande de l'app desktop sur un projet de la webapp : sa session ({@code tfa_}), l'espace et le projet.
 *
 * @param token     jeton de session de l'app
 * @param workspace slug de l'espace
 * @param projectId projet à télécharger
 */
public record DesktopTransferRequest(
    @NotBlank @Size(max = 64) String token,
    @NotBlank @Size(max = 100) String workspace,
    @NotNull Long projectId
) {}
