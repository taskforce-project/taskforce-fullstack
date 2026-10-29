package com.taskforce.tf_api.core.service.agent;

import java.util.List;

import com.taskforce.tf_api.core.service.LlmUsage;

/**
 * Ce qu'un rejeu a donné : la réponse du modèle, ses appels d'outils, le modèle qui a répondu, et l'usage, que
 * l'appelant compte comme celui d'une réponse.
 */
public record ReplayOutcome(String answer, List<ReplayCall> calls, String model, LlmUsage usage) {

    public ReplayOutcome {
        calls = calls == null ? List.of() : List.copyOf(calls);
    }

    /**
     * Un appel du modèle au rejeu. {@code effect} : ce que la règle de l'espace en décide (allow, ask, deny).
     * {@code status} : success (servi par la cassette), pending (proposé, jamais exécuté), refused (refusé par la règle),
     * error (hors du cas, ou inconnu).
     */
    public record ReplayCall(String tool, String arguments, String effect, String status) {
    }
}
