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
    Tests tests,

    /** La session de l'agent, pour qu'une reprise la continue (R139) ; un runner plus ancien ne l'envoie pas. */
    @Pattern(regexp = "[0-9a-fA-F-]{8,64}", message = "agentSession must be a session id")
    String agentSession,

    /**
     * Combien d'événements le runner a numérotés pour ce run (TF-J2-7) : moins sont arrivés, le dossier marque le trou.
     * Absent d'un runner plus ancien.
     */
    @Min(0)
    Integer events,

    /** La session brute de l'agent, gardée à part sur le poste, et que le dossier référence par son empreinte (R212). */
    @Valid
    Session session,

    /** Le dernier commit de la branche de l'agent, quand il en a fait. */
    @Pattern(regexp = "[0-9a-f]{40,64}", message = "head must be a commit hash")
    String head
) {

    /** Un résultat sans les faits de la carte, comme les envoie un runner plus ancien. */
    public RunnerResultRequest(String status, String summary, String resultUrl, String error, Boolean refused) {
        this(status, summary, resultUrl, error, refused, null, null, null, null);
    }

    /** Un résultat avec les faits de la carte, sans session d'agent. */
    public RunnerResultRequest(String status, String summary, String resultUrl, String error, Boolean refused,
                               String branch, Integer commits, Tests tests) {
        this(status, summary, resultUrl, error, refused, branch, commits, tests, null);
    }

    /** Un résultat comme l'envoie un runner d'avant la 1.18 : sans compte d'événements, ni session brute, ni commit. */
    public RunnerResultRequest(String status, String summary, String resultUrl, String error, Boolean refused,
                               String branch, Integer commits, Tests tests, String agentSession) {
        this(status, summary, resultUrl, error, refused, branch, commits, tests, agentSession, null, null, null);
    }

    /**
     * La session brute de l'agent telle que le runner l'a lue (sa sortie {@code stream-json}), gardée sur le poste : son
     * identifiant, son empreinte, sa taille.
     */
    public record Session(
        @Pattern(regexp = "[0-9a-fA-F-]{8,64}", message = "session id must be a session id") String id,
        @NotBlank @Pattern(regexp = RunnerEventsRequest.SHA256, message = "sha256 must be a sha256 digest") String sha256,
        @Min(0) long bytes
    ) {}

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
