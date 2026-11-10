package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.service.agent.EvalGrader;
import com.taskforce.tf_api.core.service.agent.ReplayOutcome;

/**
 * Ce que sait faire chaque modèle que la passerelle joint sur cette machine ou ce serveur (R113, séance n°16), mesuré par
 * les cas fixes de la banque : la table, ce que TaskForce propose pour chaque genre de demande, et le modèle de Cortex.
 *
 * @param provider      où tourne l'IA : {@code OLLAMA}, {@code OPENAI} (toute API compatible) ou {@code ANTHROPIC} ;
 *                      {@code null} quand l'IA est coupée. Jamais une adresse ni une clé.
 * @param instanceModel le modèle de Cortex sur l'instance, quand personne n'en choisit un autre
 * @param choice        le modèle que la personne a choisi pour Cortex dans la webapp, ou {@code null}
 * @param current       celui avec lequel Cortex lui répond maintenant
 * @param suiteVersion  la version des cas ; une mesure d'une autre version ne compte pas
 * @param models        les modèles de conversation servis, dans l'ordre où TaskForce propose le premier capable
 * @param proposals     pour chaque capacité, le premier modèle mesuré capable ; absente quand aucun ne l'est
 * @param proposed      le premier modèle capable de tout ce qui se mesure, ou {@code null}
 */
public record ModelCapabilityResponse(
    String provider,
    String instanceModel,
    String choice,
    String current,
    int suiteVersion,
    List<CapabilityInfo> capabilities,
    List<CaseInfo> cases,
    List<ModelRow> models,
    List<Proposal> proposals,
    String proposed
) {

    /** Une colonne de la table : ce qu'elle mesure, et son nombre de cas. */
    public record CapabilityInfo(String key, String label, String description, int cases) {
    }

    /** Un cas de la suite : sa clé (pour le rejouer), sa capacité, ce qu'il vérifie. */
    public record CaseInfo(String key, String capability, String title) {
    }

    /**
     * Une ligne : un modèle servi, s'il répond à Cortex pour la personne, sa dernière mesure, et ce que dit sa fiche chez
     * le fournisseur ({@code card}, sur Ollama ; {@code null} ailleurs). Le volet « Progress » montre la fiche comme
     * telle tant que le modèle n'est pas mesuré, jamais comme une note (R113, R125). {@code failedCases} : les clés des
     * cas ratés à leur dernière note, dans l'ordre de la suite, pour le détail de la ligne (R130).
     */
    public record ModelRow(String model, boolean current, LocalDateTime measuredAt, List<Score> scores, Card card,
                           List<String> failedCases) {
    }

    /**
     * La fiche d'un modèle chez son fournisseur : sa taille ({@code parameters}, « 8.2B »), sa fenêtre de contexte en
     * jetons, s'il prend des outils. Chaque valeur est {@code null} quand la fiche ne la dit pas.
     */
    public record Card(String parameters, Integer contextWindow, Boolean tools) {
    }

    /**
     * Une cellule : la dernière note de chaque cas de la capacité. {@code capable} quand tous ses cas sont mesurés et
     * réussis. {@code heldWords}, pour le contexte : le plus long document tenu, en mots (0 si aucun ; {@code null} sans
     * mesure). {@code tooSlow} : les cas qui n'ont pas répondu dans leur budget, ni réussis ni comptés dans {@code measured}.
     */
    public record Score(String capability, int passed, int measured, int total, boolean capable, Integer heldWords,
                        LocalDateTime measuredAt, int tooSlow) {
    }

    /** Le premier modèle capable d'une capacité, dans l'ordre de la table. */
    public record Proposal(String capability, String model) {
    }

    /** Une mesure ouverte : ses cas se rejouent un par un, dans cet ordre. */
    public record RunStarted(Long runId, String model, LocalDateTime startedAt, List<String> cases) {
    }

    /** La note d'un cas : chaque critère, ce que le modèle a appelé, un extrait de sa réponse, la taille du prompt, s'il a été trop lent. */
    public record CaseResult(String caseKey, String capability, boolean passed, List<EvalGrader.Check> checks,
                             List<ReplayOutcome.ReplayCall> calls, String answer, String model, long promptTokens, boolean tooSlow) {
    }
}
