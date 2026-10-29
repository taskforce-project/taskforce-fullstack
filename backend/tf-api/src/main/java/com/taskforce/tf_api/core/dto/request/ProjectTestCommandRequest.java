package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Corps de PUT /api/workspaces/{slug}/projects/{id}/repo/test-command : la commande de test du projet, lancée par le
 * runner après le travail de l'agent (S1, R32). Vide ou absente : aucun test lancé.
 *
 * @param testCommand une seule ligne, 500 caractères au plus
 */
public record ProjectTestCommandRequest(
    @Size(max = 500, message = "The test command is 500 characters at most")
    @Pattern(regexp = "[^\\r\\n]*", message = "The test command is a single line")
    String testCommand
) {}
