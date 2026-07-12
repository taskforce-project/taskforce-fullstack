package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Abstraction du LLM utilisée par l'agent — implémentée par {@link GroqService} (cloud, bloqué ici)
 * et {@link AiGatewayClient} (LLM local via l'AI Gateway → Ollama). Le bean actif est choisi par
 * {@code ai.provider} (cf. {@code LlmConfig}). L'agent ne connaît plus le fournisseur.
 */
public interface LlmClient {

    /** Vrai si un LLM est disponible (sinon l'agent bascule sur le repli RAG sans génération). */
    boolean isConfigured();

    /** Complétion simple → contenu textuel. {@code jsonMode} force une sortie JSON valide. */
    String chatCompletion(String model, String systemPrompt, String userPrompt, boolean jsonMode);

    /** Complétion brute (messages libres + outils) → message assistant (peut contenir {@code tool_calls}). */
    JsonNode rawChat(String model, List<Map<String, Object>> messages, List<Map<String, Object>> tools);

    /**
     * Variante avec <b>routing par tier</b> ({@code fast|standard|deep}) — pour l'AI Gateway local.
     * Les providers sans tiers (Groq) ignorent le tier (implémentation par défaut).
     */
    default String chatCompletion(String model, String systemPrompt, String userPrompt, boolean jsonMode, String tier) {
        return chatCompletion(model, systemPrompt, userPrompt, jsonMode);
    }

    default JsonNode rawChat(String model, List<Map<String, Object>> messages, List<Map<String, Object>> tools, String tier) {
        return rawChat(model, messages, tools);
    }

    /**
     * Complétion <b>multi-tours</b> (mémoire de conversation) : une liste de messages
     * {@code {role, content}} → le contenu texte de la réponse assistant. Réutilise {@link #rawChat}
     * sans outils (l'usage tokens est capturé de la même façon). Utilisée par l'agent pour injecter
     * l'historique de la conversation dans le prompt.
     */
    default String chat(String model, List<Map<String, Object>> messages, String tier) {
        JsonNode msg = rawChat(model, messages, List.of(), tier);
        return msg == null ? "" : msg.path("content").asText("");
    }

    // ── Capture d'usage (tokens) ─────────────────────────────────────────────
    // Arme un accumulateur pour le thread courant : tous les appels LLM suivants y
    // additionnent leur usage jusqu'à {@link #endUsageCapture()}. No-op par défaut
    // (providers qui ne remontent pas d'usage, ex. Groq bloqué).

    /** Démarre l'accumulation d'usage pour le thread courant. */
    default void beginUsageCapture() { /* no-op */ }

    /** Usage cumulé depuis {@link #beginUsageCapture()} (sans réinitialiser). */
    default LlmUsage currentUsage() { return LlmUsage.ZERO; }

    /** Termine l'accumulation et libère l'accumulateur du thread. */
    default void endUsageCapture() { /* no-op */ }
}
