package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Abstraction du LLM utilisée par l'agent — <b>seule implémentation</b> : {@link AiGatewayClient}
 * (l'AI Gateway Python {@code ai-service} → notre modèle Ollama local). L'agent ne connaît pas le
 * fournisseur ; le bean est fourni par {@code LlmConfig}.
 *
 * <p>Cette interface a longtemps eu deux implémentations, dont un client Groq cloud. Il est
 * <b>supprimé</b> ({@code TF-AI-GROQ-CLEANUP}) : Groq était bloqué sur le réseau (403), écarté par la
 * décision du 07/07 au profit du modèle local, et son implémentation <b>n'override jamais</b> la
 * capture d'usage ci-dessous — la sélectionner désarmait silencieusement toute la facturation IA.
 * Garder une abstraction reste utile (elle isole l'agent du transport et rend les tests mockables),
 * mais <b>on mocke cette interface, jamais une classe concrète</b>.</p>
 */
public interface LlmClient {

    /** Vrai si un LLM est disponible (sinon l'agent bascule sur le repli RAG sans génération). */
    boolean isConfigured();

    /** Complétion simple → contenu textuel. {@code jsonMode} force une sortie JSON valide. */
    String chatCompletion(String model, String systemPrompt, String userPrompt, boolean jsonMode);

    /** Complétion brute (messages libres + outils) → message assistant (peut contenir {@code tool_calls}). */
    JsonNode rawChat(String model, List<Map<String, Object>> messages, List<Map<String, Object>> tools);

    /**
     * Variante avec <b>routing par tier</b> ({@code fast|standard|deep}) — géré par l'AI Gateway local.
     * Le défaut ignore le tier : il ne sert que si une implémentation sans tiers réapparaît un jour.
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
