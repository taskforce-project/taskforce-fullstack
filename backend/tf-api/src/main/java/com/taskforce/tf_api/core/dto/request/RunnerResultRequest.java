package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Résultat posté par un runner local à la fin d'un run (ADR-013).
 *
 * @param status    {@code DONE} ou {@code FAILED}
 * @param summary   résumé du travail (attendu quand DONE)
 * @param resultUrl lien du résultat, typiquement la pull request ; http(s) uniquement, car il est rendu
 *                  cliquable dans l'interface
 * @param error     message d'échec (attendu quand FAILED)
 */
public record RunnerResultRequest(
    @NotBlank @Pattern(regexp = "DONE|FAILED", message = "status doit valoir DONE ou FAILED")
    String status,

    @Size(max = 8000)
    String summary,

    @Size(max = 1000) @Pattern(regexp = "^https?://\\S+$", message = "resultUrl doit être une URL http(s)")
    String resultUrl,

    @Size(max = 4000)
    String error
) {}
