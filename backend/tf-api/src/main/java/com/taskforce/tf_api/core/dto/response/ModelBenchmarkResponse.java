package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.service.agent.EvalGrader;
import com.taskforce.tf_api.core.service.agent.ReplayOutcome;

/**
 * Le banc des modèles (R131, séance n°19) : « que puis-je confier à ce modèle ? », tâche par tâche, dans cet espace.
 *
 * @param provider     où tourne l'IA : {@code OLLAMA}, {@code OPENAI} (toute API compatible) ou {@code ANTHROPIC} ;
 *                     {@code null} quand l'IA est coupée. Jamais une adresse ni une clé.
 * @param current      le modèle avec lequel Cortex répond à la personne
 * @param suiteVersion la version des cas ; un résultat d'une autre version ne compte pas
 * @param cases        le nombre de cas de la suite
 * @param tasks        les colonnes de la matrice
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
     * {@code not_yet} (moins), {@code null} tant que la tâche n'est pas passée entièrement. {@code judge} : qui a retourné une
     * note de cette tâche, {@code you}, {@code member}, ou {@code null} quand elles sont toutes du code.
     */
    public record Cell(String task, String verdict, int passed, int measured, int total, String judge) {
    }

    /** Une ligne : un modèle, son dernier passage, sa durée approchée en secondes, et un verdict par tâche. */
    public record ModelRow(String model, boolean current, LocalDateTime lastRunAt, long estimateSeconds, List<Cell> cells) {
    }

    /** Un passage ouvert : ses cas se jouent un par un, dans cet ordre. */
    public record RunStarted(Long runId, String model, LocalDateTime startedAt, List<String> cases) {
    }

    /**
     * Un cas du détail. {@code resultId} : null tant qu'il n'est pas passé. {@code passed} : la note qui compte, celle de la
     * personne quand elle l'a retournée ({@code personPassed}), sinon celle du code ({@code gradedPassed}).
     */
    public record CaseDetail(Long resultId, String caseKey, String title, boolean passed, boolean gradedPassed,
                             Boolean personPassed, String judge, List<EvalGrader.Check> checks,
                             List<ReplayOutcome.ReplayCall> calls, String answer, Long durationMs, LocalDateTime at) {
    }

    /** Une tâche du détail : son verdict, et ses cas. */
    public record TaskDetail(String task, String verdict, int passed, int measured, int total, String judge,
                             List<CaseDetail> cases) {
    }

    /** Le détail d'un modèle : par tâche et par cas, et les essais à l'aveugle de la personne qui lit. */
    public record ModelDetail(String model, boolean current, LocalDateTime lastRunAt, int cases, List<TaskDetail> tasks,
                              List<TrialResult> trials) {
    }

    /** Un essai ouvert : ses lettres, dans un ordre tiré par le serveur ; aucun nom de modèle avant le choix. */
    public record TrialStarted(Long trialId, String task, String issueKey, List<String> letters) {
    }

    /** Une réponse de l'essai, avant le choix : sa lettre, son texte, son temps, jamais le modèle. */
    public record TrialLetterAnswer(String letter, String answer, Long durationMs) {
    }

    /** Une réponse de l'essai, après le choix : la lettre et le modèle. */
    public record TrialAnswer(String letter, String model, String answer, Long durationMs) {
    }

    /** Un essai tranché : la lettre choisie et son modèle, {@code null} quand la personne n'en a retenu aucune. */
    public record TrialResult(Long trialId, String task, String issueKey, String chosenLetter, String chosenModel,
                              LocalDateTime decidedAt, List<TrialAnswer> answers) {
    }
}
