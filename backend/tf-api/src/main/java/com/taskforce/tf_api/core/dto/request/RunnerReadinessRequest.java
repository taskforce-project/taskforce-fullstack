package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Pattern;

/**
 * Ce que le runner dit de son poste en réclamant une tâche (R37) : l'agent peut-il partir, et sinon le code du problème
 * ({@code claude-signed-out}, {@code claude-outdated}, {@code claude-missing}, cf. {@code taskforce-runner/src/readiness.ts}).
 * Un runner plus ancien n'envoie rien : il est tenu pour prêt.
 */
public record RunnerReadinessRequest(
    Boolean agentReady,
    @Pattern(regexp = "[a-z][a-z-]{0,39}") String agentProblem
) {

    /** Faux seulement quand le runner dit lui-même ne pas pouvoir lancer l'agent. */
    public boolean ready() {
        return !Boolean.FALSE.equals(agentReady);
    }
}
