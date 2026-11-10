package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.service.ai.ModelWindow;

/**
 * Accès au modèle de langage. Seule implémentation : {@link AiGatewayClient}, par la passerelle de modèles du
 * backend (Ollama, toute API compatible OpenAI, l'API d'Anthropic). Les appelants ne choisissent pas un modèle
 * mais un <b>tier</b> : {@code fast} (petit modèle, réponses courtes), {@code standard} (modèle principal, défaut) ou
 * {@code deep} (modèle principal qui raisonne). Les tests mockent cette interface, jamais une classe concrète.
 */
public interface LlmClient {

    /** Vrai si l'IA est disponible (fournisseur configuré et joignable) ; sinon l'appelant passe à son repli. */
    boolean isConfigured();

    /** Complétion système + utilisateur, renvoie le contenu texte. {@code jsonMode} force un JSON valide. */
    String chatCompletion(String systemPrompt, String userPrompt, boolean jsonMode, String tier);

    /** Complétion brute (messages libres et outils) : renvoie le message assistant, qui peut porter des {@code tool_calls}. */
    JsonNode rawChat(List<Map<String, Object>> messages, List<Map<String, Object>> tools, String tier);

    /**
     * Complétion brute avec un modèle nommé, sans tier : le rejeu d'un cas de la banque compare deux modèles (R61,
     * séance n°10). La passerelle prend le modèle demandé quand aucun tier n'est donné.
     */
    JsonNode rawChatWithModel(List<Map<String, Object>> messages, List<Map<String, Object>> tools, String model);

    /** Complétion multi-tours ({@code {role, content}}, ordre chronologique), sans outils, renvoie le contenu texte. */
    default String chat(List<Map<String, Object>> messages, String tier) {
        JsonNode msg = rawChat(messages, List.of(), tier);
        return msg == null ? "" : msg.path("content").asText("");
    }

    /**
     * La fenêtre de contexte du modèle que ce palier prendrait maintenant, celui que la personne a choisi d'abord : le
     * budget d'une requête la lit avant de la construire. Null pour un client qui ne connaît pas de modèle.
     */
    default ModelWindow contextWindow(String tier) { return null; }

    /**
     * Un modèle servi dont la fenêtre connue tient {@code tokens} de prompt, le plus petit d'abord, à proposer quand une
     * demande est trop grande pour celui-ci ; jamais d'après une estimation, jamais un modèle qui ne prend pas les outils.
     */
    default Optional<ModelWindow> largerWindow(String tier, int tokens) { return Optional.empty(); }

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

    /** Ce que le modèle a lu au dernier appel depuis {@link #beginUsageCapture()} (son prompt, sa fenêtre), s'il y en a eu. */
    default LlmContext currentContext() { return null; }
}
