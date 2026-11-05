package com.taskforce.tf_api.core.service;

/**
 * Ce que le modèle a lu au dernier appel d'un tour : la taille de son prompt, comptée par le fournisseur, et la fenêtre
 * de contexte que la passerelle a donnée à cette requête (Ollama : taillée à chaque requête, jusqu'à
 * {@code AI_OLLAMA_MAX_CONTEXT}). La jauge de contexte de la conversation les compare (test du CEO du 05/11/2026 : elle
 * comparait le cumul des tokens de la conversation à une fenêtre écrite en dur).
 *
 * @param promptTokens les tokens du prompt du dernier appel
 * @param window       la fenêtre de ce prompt, en tokens ; null quand le fournisseur la tient lui-même
 */
public record LlmContext(long promptTokens, Integer window) {
}
