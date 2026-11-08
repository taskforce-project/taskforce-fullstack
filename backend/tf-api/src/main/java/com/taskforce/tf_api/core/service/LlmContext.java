package com.taskforce.tf_api.core.service;

/**
 * Ce que le modèle a lu au dernier appel d'un tour : la taille de son prompt, comptée par le fournisseur, et la fenêtre
 * de contexte de cette requête : celle que la passerelle a donnée à Ollama (jusqu'à {@code AI_OLLAMA_MAX_CONTEXT}), celle
 * qu'un autre fournisseur dit de ce modèle, sinon une estimation. La jauge de contexte de la conversation les compare
 * (test du CEO du 05/11/2026 : elle comparait le cumul des tokens de la conversation à une fenêtre écrite en dur).
 *
 * @param promptTokens les tokens du prompt du dernier appel
 * @param window       la fenêtre de ce prompt, en tokens ; null quand personne ne la dit
 * @param estimated    la fenêtre n'est pas connue : c'est la valeur des réglages
 */
public record LlmContext(long promptTokens, Integer window, boolean estimated) {

    /** Une fenêtre connue. */
    public LlmContext(long promptTokens, Integer window) {
        this(promptTokens, window, false);
    }
}
