package com.taskforce.tf_api.core.dto.request;

import java.util.List;
import java.util.Map;

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
 * @param facts   les faits que le runner a jugés (un jeu par morceau de l'appel) : le serveur les rejuge avec les mêmes
 *                règles pour savoir qui peut accorder (R98) ; vide pour un runner plus ancien
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
    String reason,
    @Size(max = 20)
    List<@Size(max = 30) Map<@Size(max = 60) String, @Size(max = 4000) String>> facts
) {

    /** Une demande de l'agent. */
    public RunnerApprovalRequest(String tool, String summary) {
        this(tool, summary, null, null, null, null, null);
    }

    /** Une demande sans la règle, comme les envoie un runner plus ancien. */
    public RunnerApprovalRequest(String tool, String summary, String askedBy) {
        this(tool, summary, askedBy, null, null, null, null);
    }

    /** Une demande avec la règle, sans les faits, comme les envoie un runner d'avant les couches. */
    public RunnerApprovalRequest(String tool, String summary, String askedBy, String action, String rule, String reason) {
        this(tool, summary, askedBy, action, rule, reason, null);
    }

    public boolean byRunner() {
        return "runner".equals(askedBy);
    }
}
