package com.taskforce.tf_api.core.service.agent;

import java.util.List;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.DecisionBrief.Snapshot;
import com.taskforce.tf_api.core.enums.AnalysisDepth;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.agent.AnalysisJobService.JobContext;
import com.taskforce.tf_api.core.service.agent.DecisionService.Analysis;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Exécution asynchrone d'un workflow d'analyse — la boucle OODA jouée étape par étape.
 *
 * <p>Le runner ne touche pas à la base directement : il enchaîne les briques de
 * {@link DecisionService} (observe → contexte → analyse) et confie chaque transition d'état à
 * {@link AnalysisJobService}, qui persiste et diffuse le plan sur STOMP. Le dock voit donc les
 * étapes se dérouler en direct.
 *
 * <p>Bean séparé (et non une méthode {@code @Async} de {@code AnalysisJobService}) : Spring
 * n'applique pas {@code @Async} sur un auto-appel — la méthode s'exécuterait alors sur le thread
 * de la requête HTTP, et l'utilisateur attendrait la fin de l'analyse.
 *
 * <p><b>Reprise après clarification</b> : quand l'humain répond, {@link #run} est simplement rejoué.
 * Les métriques sont ré-observées (le projet a pu bouger pendant l'attente) et la réponse est
 * réinjectée dans le prompt, ce qui interdit au modèle de poser une seconde question.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AnalysisJobRunner {

    private final AnalysisJobService jobService;
    private final DecisionService    decisionService;
    private final AiMeter            aiMeter; // gate quota + comptage de la conso tokens de l'analyse

    /** Joue le workflow de bout en bout. Toute erreur bascule le job en FAILED (jamais d'exception qui fuit). */
    @Async
    public void run(Long jobId) {
        try {
            JobContext ctx = jobService.startJob(jobId);
            boolean deep = ctx.depth() == AnalysisDepth.DEEP;
            String clarification = ctx.answer();

            // Observe — métriques réelles du projet.
            Snapshot snapshot = decisionService.snapshot(ctx.project().getId());
            jobService.step(jobId, AnalysisPlan.OBSERVE, AnalysisPlan.COMPLETED);

            // Contexte — Brain OS (RAG).
            jobService.step(jobId, AnalysisPlan.CONTEXT, AnalysisPlan.IN_PROGRESS);
            List<KnowledgeNode> hits = decisionService.retrieveContext(ctx.workspaceId(), ctx.project().getName());
            jobService.step(jobId, AnalysisPlan.CONTEXT, AnalysisPlan.COMPLETED);

            // Analyse — le modèle décide, ou demande une clarification (DEEP, premier tour seulement).
            jobService.step(jobId, AnalysisPlan.ANALYZE, AnalysisPlan.IN_PROGRESS);
            boolean allowQuestion = deep && clarification == null;
            // Métré : gate quota (au-dessus du plafond → job en échec avec message d'upsell) + comptage réel.
            Analysis analysis = aiMeter.metered(ctx.workspaceId(),
                () -> decisionService.analyze(ctx.project(), snapshot, hits, deep, clarification, allowQuestion));

            if (analysis.needsInput()) {
                jobService.suspend(jobId, analysis.question());
                return;  // reprise sur réponse humaine → run(jobId) rejoué
            }
            jobService.step(jobId, AnalysisPlan.ANALYZE, AnalysisPlan.COMPLETED);
            if (deep) {
                // Étape franchie : soit l'humain a répondu, soit le modèle n'a pas eu besoin de demander.
                jobService.step(jobId, AnalysisPlan.CLARIFY, AnalysisPlan.COMPLETED);
            }

            // Persiste le brief : ses priorités deviennent actionnables.
            jobService.step(jobId, AnalysisPlan.PERSIST, AnalysisPlan.IN_PROGRESS);
            jobService.complete(jobId, analysis.brief());

        } catch (Exception ex) {
            log.error("Workflow d'analyse {} en échec", jobId, ex);
            failQuietly(jobId, ex);
        }
    }

    /** Le marquage FAILED ne doit jamais masquer l'erreur d'origine (déjà journalisée). */
    private void failQuietly(Long jobId, Exception cause) {
        try {
            String message = cause.getMessage() != null ? cause.getMessage() : cause.getClass().getSimpleName();
            jobService.fail(jobId, message);
        } catch (Exception ex) {
            log.error("Impossible de marquer le workflow {} en échec : {}", jobId, ex.getMessage());
        }
    }
}
