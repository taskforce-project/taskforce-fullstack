package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Demande de validation ouverte par le runner local (OSS-5.4).
 *
 * @param tool    outil (« Bash », « WebFetch ») ou geste du runner (« git push »)
 * @param summary ce que l'action ferait (commande, fichier, adresse) ; tronqué à 2000 caractères au stockage
 * @param askedBy {@code agent} (défaut) pour une action de l'agent, {@code runner} quand TaskForce demande lui-même
 *                (décision J4 : chaque demande dit qui la pose)
 * @param action  l'action que les règles ont jugée ({@code web.search}, {@code shell}...), pour la dire en mots (R78)
 * @param rule    la règle qui demande, vide quand aucune ne couvre l'action
 * @param reason  la raison de cette règle, telle qu'elle s'écrit pour la personne
 */
public record RunnerApprovalRequest(
    @NotBlank @Size(max = 120)
    String tool,
    @NotBlank @Size(max = 4000)
    String summary,
    @Pattern(regexp = "agent|runner", message = "askedBy must be agent or runner")
    String askedBy,
    @Size(max = 40) @Pattern(regexp = "[a-z]+(\\.[a-z]+)?", message = "action must look like web.search")
    String action,
    @Size(max = 120)
    String rule,
    @Size(max = 500)
    String reason
) {

    /** Une demande de l'agent. */
    public RunnerApprovalRequest(String tool, String summary) {
        this(tool, summary, null, null, null, null);
    }

    /** Une demande sans la règle, comme les envoie un runner plus ancien. */
    public RunnerApprovalRequest(String tool, String summary, String askedBy) {
        this(tool, summary, askedBy, null, null, null);
    }

    public boolean byRunner() {
        return "runner".equals(askedBy);
    }
}
