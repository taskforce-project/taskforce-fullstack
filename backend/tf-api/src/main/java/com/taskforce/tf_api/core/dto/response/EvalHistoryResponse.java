package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * L'histoire de la banque d'évaluations d'un espace (R61, R118, R125) : ses rejeux par modèle et par date, et pour chaque
 * cas, d'où il vient et sa note à chaque rejeu depuis qu'il est entré. Le volet « Progress » en tire la courbe et ce qui
 * a amélioré Cortex. Rien n'y classe les modèles ni ne suit l'activité de l'agent (R57).
 *
 * @param runs  les derniers rejeux, du plus ancien au plus récent
 * @param cases les cas actifs, du plus récent au plus ancien
 */
public record EvalHistoryResponse(List<Run> runs, List<Case> cases) {

    /**
     * Un rejeu : le modèle demandé ({@code default} quand il n'en nommait pas), celui qui a répondu ({@code answeredBy},
     * lu dans sa première note ; {@code null} avant elle), ses dates, ses cas, ceux notés, ceux réussis.
     */
    public record Run(Long id, String model, String answeredBy, LocalDateTime startedAt, LocalDateTime finishedAt,
                      int total, int graded, int passed) {
    }

    /**
     * Un cas : son titre, la question telle qu'elle a été posée et son jour, quand il est entré dans la banque, s'il vient
     * de la personne qui lit, d'où il vient, et sa note dans chaque rejeu depuis, dans l'ordre des rejeux. {@code expected}
     * : ce qu'il aurait fallu faire, dans ses mots (vide sinon) ; {@code waiting} : il attend ses critères ; {@code record} :
     * le dossier d'un cas qui les attend, d'où se tire leur formulaire (null sinon).
     */
    public record Case(Long id, String title, String question, LocalDate askedOn, LocalDateTime addedAt, boolean mine,
                       Origin origin, List<Grade> grades, String expected, boolean waiting, String record) {

        /** Un cas qui n'attend rien. */
        public Case(Long id, String title, String question, LocalDate askedOn, LocalDateTime addedAt, boolean mine,
                    Origin origin, List<Grade> grades) {
            this(id, title, question, askedOn, addedAt, mine, origin, grades, "", false, null);
        }
    }

    /**
     * D'où vient un cas. {@code incident} : TaskForce a corrigé la réponse (R116), l'incident de confiance d'E17, avec
     * ce que le modèle avait dit ({@code said}) et ce que TaskForce a montré ({@code shown}). {@code answer} : une réponse
     * de Cortex dans une conversation. {@code unknown} : le dossier de la réponse n'est plus là, ou le cas a été écrit à
     * la main ; la question et son jour restent.
     */
    public record Origin(String kind, List<String> said, String shown) {
    }

    /** La note d'un cas dans un rejeu. */
    public record Grade(Long runId, boolean passed) {
    }
}
