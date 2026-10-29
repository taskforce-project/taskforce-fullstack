package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Accès au modèle de langage. Seule implémentation : {@link AiGatewayClient} (ai-service, qui parle au
 * fournisseur configuré). Les appelants ne choisissent pas un modèle mais un <b>tier</b> :
 * {@code fast} (petit modèle, réponses courtes), {@code standard} (modèle principal, défaut) ou
 * {@code deep} (modèle principal qui raisonne). Les tests mockent cette interface, jamais une classe concrète.
 */
public interface LlmClient {

    /** Vrai si l'IA est disponible (fournisseur configuré et joignable) ; sinon l'appelant passe à son repli. */
    boolean isConfigured();

    /** Complétion système + utilisateur, renvoie le contenu texte. {@code jsonMode} force un JSON valide. */
    String chatCompletion(String systemPrompt, String userPrompt, boolean jsonMode, String tier);

    /** Complétion brute (messages libres et outils) : renvoie le message assistant, qui peut porter des {@code tool_calls}. */
    JsonNode rawChat(List<Map<String, Object>> messages, List<Map<String, Object>> tools, String tier);

    /** Complétion multi-tours ({@code {role, content}}, ordre chronologique), sans outils, renvoie le contenu texte. */
    default String chat(List<Map<String, Object>> messages, String tier) {
        JsonNode msg = rawChat(messages, List.of(), tier);
        return msg == null ? "" : msg.path("content").asText("");
    }

    // ── Capture d'usage (tokens) ─────────────────────────────────────────────
    // Arme un accumulateur pour le thread courant : chaque appel suivant y ajoute son usage jusqu'à
    // endUsageCapture(). Sert au quota et au suivi de consommation (AiMeter, AiUsageService).

    /** Démarre l'accumulation d'usage pour le thread courant. */
    default void beginUsageCapture() { /* no-op */ }

    /** Usage cumulé depuis {@link #beginUsageCapture()} (sans réinitialiser). */
    default LlmUsage currentUsage() { return LlmUsage.ZERO; }

    /** Termine l'accumulation et libère l'accumulateur du thread. */
    default void endUsageCapture() { /* no-op */ }

    /** Le modèle qui a répondu au dernier appel depuis {@link #beginUsageCapture()}, s'il est connu. */
    default String currentModel() { return null; }
}
