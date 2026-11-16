package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.process.ProcessModel;

import jakarta.validation.constraints.NotNull;

/**
 * Un processus à vérifier ou à publier (ADR-027) : son modèle, en données. Le vérificateur en juge tout le reste, et
 * dit ses refus en phrases.
 */
public record PublishProcessRequest(
    @NotNull
    ProcessModel model
) {
}
