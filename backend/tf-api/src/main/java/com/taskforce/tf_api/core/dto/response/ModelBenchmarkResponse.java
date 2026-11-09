package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.service.agent.EvalGrader;
import com.taskforce.tf_api.core.service.agent.ReplayOutcome;

/**
 * Le banc des modèles (R131, séance n°19 ; R142, séance n°20) : « que puis-je confier à ce modèle ? », tâche par tâche, dans
 * cet espace.
 *
 * @param provider     où tourne l'IA : {@code OLLAMA}, {@code OPENAI} (toute API compatible) ou {@code ANTHROPIC} ;
 *                     {@code null} quand l'IA est coupée. Jamais une adresse ni une clé.
 * @param current      le modèle avec lequel Cortex répond à la personne
 * @param suiteVersion la version des cas ; un résultat d'une autre version ne compte pas
 * @param cases        le nombre de cas de la suite
 * @param tasks        les colonnes de la matrice ; la dernière est « Your tests » quand l'espace a des cas dans sa banque
 * @param models       les modèles servis : celui en service d'abord, puis l'ordre d'installation, jamais un classement (R57)
 */
public record ModelBenchmarkResponse(
    String provider,
    String current,
    int suiteVersion,
    int cases,
    List<TaskInfo> tasks,
    List<ModelRow> models
) {

    /** Une tâche : son nom, ce qu'elle mesure, son nombre de cas, et si elle s'essaie à l'aveugle sur une issue. */
    public record TaskInfo(String key, String label, String description, int cases, boolean trial) {
    }

    /**
     * Le verdict d'un modèle sur une tâche : {@code give_it} (tous les cas), {@code with_review} (au moins la moitié),
     * {@code not_yet} (moins), {@code too_slow} (au moins un cas n'a pas répondu dans son budget : la mesure ne dit rien de
     * sa qualité), {@code null} tant que la tâche n'est pas passée entièrement. {@code judge} : qui a retourné une note de
     * cette tâche, {@code you}, {@code member}, ou {@code null} quand elles sont toutes du code. {@code tooSlow} : combien
     * de ses cas ont dépassé leur budget.
     */
    public record Cell(String task, String verdict, int passed, int measured, int total, String judge, int tooSlow) {
    }

    /**
     * Ce qu'on sait d'un modèle, sans le noter (R142) : ce que dit sa fiche chez son fournisseur, et ce qu'on a vu quand il
     * s'est chargé. Chaque valeur est {@code null} quand personne ne la dit ; rien n'est deviné.
     *
     * @param family       sa famille, telle qu'Ollama la nomme (« qwen3 »)
     * @param parameters   sa taille, en paramètres (« 14.8B »)
     * @param diskBytes    sa place sur le disque, en octets
     * @param contextWindow sa fenêtre de contexte, en jetons
     * @param tools        il prend les outils de Cortex
     * @param chat         il sait converser ; {@code false} : un modèle de base, qui complète du texte, ne se passe pas
     * @param memoryBytes  la mémoire qu'il occupait à son dernier chargement ici
     * @param gpuBytes     ce qui en tenait sur la carte graphique ; le reste tournait sur le processeur
     * @param loadProblem  son dernier chargement n'a pas abouti : {@code too_slow} ou {@code failed}
     */
    public record ModelFacts(String family, String parameters, Long diskBytes, Integer contextWindow,
                             Boolean tools, Boolean chat, Long memoryBytes, Long gpuBytes, String loadProblem) {
    }

    /** Une ligne : un modèle, son dernier passage, sa durée approchée en secondes, un verdict par tâche, et ce qu'on sait de lui. */
    public record ModelRow(String model, boolean current, LocalDateTime lastRunAt, long estimateSeconds, List<Cell> cells,
                           ModelFacts facts) {
    }

    /** Un passage ouvert : ses cas se jouent un par un, dans cet ordre. */
    public record RunStarted(Long runId, String model, LocalDateTime startedAt, List<String> cases) {
    }

    /**
     * Le premier appel d'un passage, qui charge le modèle avant que rien ne soit chronométré. {@code status} : {@code loaded} ;
     * {@code too_slow} ou {@code failed}, le modèle se passe pour cette fois et le passage va au suivant ; {@code unreachable},
     * l'IA ne répond plus, et {@code message} dit quoi faire.
     */
    public record LoadResult(String status, Long loadMs, Long memoryBytes, Long gpuBytes, String message) {
    }

    /** Un passage dans l'histoire de l'espace : ses cas notés, réussis, et ceux qui ont dépassé leur budget. */
    public record RunLine(Long runId, String model, LocalDateTime startedAt, int total, int measured, int passed, int tooSlow) {
    }

    /**
     * Un cas du détail. {@code resultId} : null tant qu'il n'est pas passé. {@code passed} : la note qui compte, celle de la
     * personne quand elle l'a retournée ({@code personPassed}), sinon celle du code ({@code gradedPassed}). {@code tooSlow} :
     * le modèle n'a pas répondu dans le budget du cas ; il n'y a rien à juger.
     */
    public record CaseDetail(Long resultId, String caseKey, String title, boolean passed, boolean gradedPassed,
                             Boolean personPassed, String judge, List<EvalGrader.Check> checks,
                             List<ReplayOutcome.ReplayCall> calls, String answer, Long durationMs, LocalDateTime at, boolean tooSlow) {
    }

    /** Une tâche du détail : son verdict, et ses cas. */
    public record TaskDetail(String task, String verdict, int passed, int measured, int total, String judge, int tooSlow,
                             List<CaseDetail> cases) {
    }

    /** Le détail d'un modèle : par tâche et par cas, et les essais à l'aveugle de la personne qui lit. */
    public record ModelDetail(String model, boolean current, LocalDateTime lastRunAt, int cases, List<TaskDetail> tasks,
                              List<TrialResult> trials) {
    }

    /** Un essai ouvert : ses lettres, dans un ordre tiré par le serveur ; aucun nom de modèle avant le choix. */
    public record TrialStarted(Long trialId, String task, String issueKey, List<String> letters) {
    }

    /** Une réponse de l'essai, avant le choix : sa lettre, son texte, son temps, jamais le modèle. {@code tooSlow} : rien n'est arrivé à temps. */
    public record TrialLetterAnswer(String letter, String answer, Long durationMs, boolean tooSlow) {
    }

    /** Une réponse de l'essai, après le choix : la lettre et le modèle. */
    public record TrialAnswer(String letter, String model, String answer, Long durationMs, boolean tooSlow) {
    }

    /** Un essai tranché : la lettre choisie et son modèle, {@code null} quand la personne n'en a retenu aucune. */
    public record TrialResult(Long trialId, String task, String issueKey, String chosenLetter, String chosenModel,
                              LocalDateTime decidedAt, List<TrialAnswer> answers) {
    }
}
