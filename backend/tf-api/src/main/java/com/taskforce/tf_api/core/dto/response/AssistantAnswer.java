package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Réponse structurée de l'assistant agentique. Pensée pour un rendu riche (kit chat) :
 * étapes du raisonnement, outils appelés, sources Brain OS citées, plus la réponse markdown.
 *
 * <p>{@code mode} : "fast" (Q&A simple), "deep" (raisonnement + outils), "fallback" (sans LLM —
 * on expose quand même le RAG : sources réelles + réponse de repli).
 */
public record AssistantAnswer(
    String answer,
    String reasoning,
    String mode,
    List<AssistantSource> sources,
    List<AssistantStep> steps,
    List<AssistantToolCall> toolCalls,
    AssistantUsage usage
) {
    /** Une note Brain OS utilisée pour fonder la réponse (RAG). */
    public record AssistantSource(String title, String domain, Double score) {}

    /**
     * Une étape du déroulé de l'agent. status : pending | active | done | error.
     * {@code description} = détail optionnel (routing, domaines trouvés, outils appelés…).
     */
    public record AssistantStep(String label, String status, String description) {
        /** Compat : étape sans détail. */
        public AssistantStep(String label, String status) { this(label, status, null); }
    }

    /** Un appel d'outil effectué par l'agent. status : success | error | running. */
    public record AssistantToolCall(String name, String status, String input, String output) {}

    /** Tokens réellement consommés par ce tour (cumulés sur les appels LLM). */
    public record AssistantUsage(long promptTokens, long completionTokens, long totalTokens) {
        public static final AssistantUsage NONE = new AssistantUsage(0, 0, 0);
    }
}
