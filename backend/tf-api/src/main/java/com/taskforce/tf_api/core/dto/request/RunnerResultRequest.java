package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
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
 * @param refused   vrai quand une règle a refusé la mission au départ : ce n'est pas une panne (R38) ; un runner plus
 *                  ancien ne l'envoie pas
 */
public record RunnerResultRequest(
    @NotBlank @Pattern(regexp = "DONE|FAILED", message = "status must be DONE or FAILED")
    String status,

    @Size(max = 8000)
    String summary,

    @Size(max = 1000) @Pattern(regexp = "^https?://\\S+$", message = "resultUrl must be an http(s) URL")
    String resultUrl,

    @Size(max = 4000)
    String error,

    Boolean refused,

    /** La branche de l'agent et ses commits, pour la carte de résultat (R78) ; absents sans changement de code. */
    @Size(max = 255)
    String branch,

    @Min(0)
    Integer commits,

    /** Les tests du projet tels que le runner les a lancés (R32) ; absents quand aucun n'a tourné. */
    @Valid
    Tests tests
) {

    /** Un résultat sans les faits de la carte, comme les envoie un runner plus ancien. */
    public RunnerResultRequest(String status, String summary, String resultUrl, String error, Boolean refused) {
        this(status, summary, resultUrl, error, refused, null, null, null);
    }

    /**
     * @param passedCount combien ont passé, et {@code total} sur combien, quand la sortie des tests le dit
     */
    public record Tests(
        @NotBlank @Size(max = 500) String command,
        boolean ran,
        boolean passed,
        @Min(0) Integer passedCount,
        @Min(0) Integer total
    ) {}
}
