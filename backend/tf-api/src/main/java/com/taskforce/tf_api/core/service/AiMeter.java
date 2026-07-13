package com.taskforce.tf_api.core.service;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Point de métrage <b>UNIQUE</b> de la consommation LLM hors chat Cortex : enveloppe une unité de
 * travail IA par (1) le <b>gate de quota</b> mensuel du compte ({@link AiUsageService#assertWithinQuota})
 * AVANT tout appel, (2) la <b>capture d'usage</b> tokens ({@link LlmClient#beginUsageCapture()}),
 * (3) l'<b>enregistrement</b> best-effort de la conso réelle ({@link AiUsageService#record}) APRÈS.
 *
 * <p>Avant ce helper, seul le chat Cortex ({@code AgentService}) était métré : le smart-assign, la
 * génération de graphes, la génération de spec d'issue, les analyses asynchrones et la compression
 * d'historique consommaient des tokens <b>sans gate ni comptage</b> → quota contournable et conso
 * sous-évaluée (TF-AI-CONSUMPTION-WF). Ces chemins passent désormais tous par {@link #metered}.
 *
 * <p><b>Dégradation gracieuse</b> : le gate lève une {@link IllegalStateException} (message d'upsell)
 * quand le plafond est atteint. Les appelants enveloppent déjà leur appel LLM dans un try/catch avec
 * repli déterministe (heuristique, gabarit, brief de repli) : au-dessus du quota, aucun token n'est
 * consommé (le gate lève AVANT l'appel) et l'utilisateur récupère le repli — le coûteux (le LLM) est
 * bien bloqué. Le workflow d'analyse async, lui, bascule le job en échec avec ce message (honnête).
 *
 * <p><b>Ré-entrant</b> : un métrage imbriqué sur le même thread réutilise l'externe sans ré-armer la
 * capture ni re-gater (l'appelant le plus externe compte la totalité). {@code AgentService} arme sa
 * capture en direct (métrage inline avec étapes animées) ; aucun de ses outils n'emprunte un chemin
 * métré, donc pas de conflit sur l'accumulateur thread-local du {@link LlmClient}.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiMeter {

    private final AiUsageService usage;
    private final LlmClient      llm;

    /** Vrai si un métrage est déjà actif sur ce thread (évite de ré-armer/re-gater en imbrication). */
    private final ThreadLocal<Boolean> active = ThreadLocal.withInitial(() -> Boolean.FALSE);

    /** Unité de travail IA pouvant lever une exception vérifiée (les appels LLM déclarent {@code throws Exception}). */
    @FunctionalInterface
    public interface AiCall<T> {
        T call() throws Exception;
    }

    /**
     * Exécute {@code work} sous quota (gate {@code 409} si plafond atteint) + capture puis
     * enregistrement d'usage, et renvoie son résultat. À appeler <b>autour</b> de l'appel LLM,
     * dans le try/catch existant de l'appelant (pour la dégradation gracieuse).
     */
    public <T> T metered(Long workspaceId, AiCall<T> work) throws Exception {
        if (Boolean.TRUE.equals(active.get())) {
            return work.call(); // déjà sous métrage sur ce thread → l'appelant externe compte la totalité
        }
        usage.assertWithinQuota(workspaceId); // AVANT tout appel : au-dessus du plafond, rien n'est consommé
        active.set(Boolean.TRUE);
        llm.beginUsageCapture();
        try {
            return work.call();
        } finally {
            try {
                usage.record(workspaceId, llm.currentUsage());
            } catch (Exception e) {
                log.warn("Suivi conso IA KO (ws={}) : {}", workspaceId, e.getMessage());
            }
            llm.endUsageCapture();
            active.remove();
        }
    }
}
