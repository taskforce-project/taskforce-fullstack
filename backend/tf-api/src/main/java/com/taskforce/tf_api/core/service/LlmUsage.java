package com.taskforce.tf_api.core.service;

/**
 * Compteur de tokens LLM — usage <b>réel</b> remonté par l'AI Gateway (Ollama, format OpenAI).
 * Sommable sur les multiples appels d'un même tour (boucle de tool-calling).
 */
public record LlmUsage(long promptTokens, long completionTokens, long totalTokens) {

    public static final LlmUsage ZERO = new LlmUsage(0, 0, 0);

    public LlmUsage plus(LlmUsage other) {
        return new LlmUsage(
            promptTokens + other.promptTokens,
            completionTokens + other.completionTokens,
            totalTokens + other.totalTokens);
    }
}
