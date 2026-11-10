package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Ce que le runner a fait d'un ordre (R139, R140).
 *
 * @param ok      le geste a eu lieu
 * @param message ce qui s'est passé, en mots ; montré à la personne quand le geste n'a pas abouti
 * @param gone    la branche de la mission n'existe plus sur ce poste ni sur GitHub : l'action disparaît
 * @param commit  le commit du retour en arrière ; absent si le fichier était déjà comme avant
 * @param commits les commits que la branche porte maintenant
 * @param pushed  le retour en arrière est aussi sur GitHub
 * @param trace   ce que les règles de la mission ont dit du geste, pour son dossier de preuve
 * @param changes le nouveau relevé des fichiers de la mission
 */
public record RunnerCommandResultRequest(
    boolean ok,

    @NotBlank @Size(max = 1000)
    String message,

    Boolean gone,

    @Pattern(regexp = "[0-9a-f]{40,64}", message = "commit must be a commit hash")
    String commit,

    @Min(0)
    Integer commits,

    Boolean pushed,

    @Size(max = 10)
    List<@Valid Trace> trace,

    @Valid
    RunnerChangesRequest changes,

    /** Le détail technique d'un échec : il va au dossier de preuve, jamais à l'écran (R133). */
    @Size(max = 1000)
    String detail
) {

    /** Un résultat sans détail technique. */
    public RunnerCommandResultRequest(boolean ok, String message, Boolean gone, String commit, Integer commits, Boolean pushed,
                                      List<Trace> trace, RunnerChangesRequest changes) {
        this(ok, message, gone, commit, commits, pushed, trace, changes, null);
    }

    /**
     * @param action l'action jugée ({@code file.write}, {@code git.push}...)
     * @param effect ce que les règles en ont dit
     * @param rule   la règle qui l'a dit ; absente quand aucune ne s'applique
     */
    public record Trace(
        @NotNull @Size(max = 80) String action,
        @NotNull @Pattern(regexp = "allow|ask|deny", message = "effect must be allow, ask or deny") String effect,
        @Size(max = 80) String rule
    ) {}
}
