package com.taskforce.tf_api.core.service.agent;

import java.util.List;

import com.taskforce.tf_api.core.service.LlmUsage;

/**
 * Ce qu'un rejeu a donné : la réponse telle que la personne la verrait ({@code answer}, corrigée par TaskForce), ses appels
 * d'outils, le modèle qui a répondu, l'usage, que l'appelant compte comme celui d'une réponse, ce que les tours d'avant
 * avaient fait, et ce que le modèle a répondu lui-même ({@code said}, avant toute correction) : la banque y note ce que
 * le modèle a nié (relecture R159 de la PR #548).
 */
public record ReplayOutcome(String answer, List<ReplayCall> calls, String model, LlmUsage usage,
                            List<ActionClaimCheck.Done> thread, String said) {

    public ReplayOutcome {
        calls = calls == null ? List.of() : List.copyOf(calls);
        thread = thread == null ? List.of() : List.copyOf(thread);
        said = said == null ? answer : said;
    }

    /** Un rejeu dont la réponse n'a pas été corrigée : le modèle a dit ce que la personne voit. */
    public ReplayOutcome(String answer, List<ReplayCall> calls, String model, LlmUsage usage,
                         List<ActionClaimCheck.Done> thread) {
        this(answer, calls, model, usage, thread, answer);
    }

    /** Un rejeu d'une seule question : rien n'avait été fait avant elle. */
    public ReplayOutcome(String answer, List<ReplayCall> calls, String model, LlmUsage usage) {
        this(answer, calls, model, usage, List.of());
    }

    /**
     * Un appel du modèle au rejeu. {@code effect} : ce que la règle de l'espace en décide (allow, ask, deny).
     * {@code status} : success (servi par la cassette), pending (proposé, jamais exécuté), refused (refusé par la règle),
     * error (hors du cas, ou inconnu).
     */
    public record ReplayCall(String tool, String arguments, String effect, String status) {
    }
}
