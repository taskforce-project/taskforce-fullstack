package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Ce que l'écran « AI » de l'app desktop montre : le fournisseur répond-il, quels modèles il annonce, lesquels servent.
 * Même forme que l'état que servait le relais de la coque (desktop/src/ai.ts), que l'interface lit déjà. Ni adresse ni
 * clé : la coque garde la clé dans le trousseau du système.
 *
 * @param reachable   la conversation répond
 * @param models      les modèles qu'elle annonce
 * @param embedModels les modèles qu'annonce le fournisseur des vecteurs (Ollama quand la conversation passe par Anthropic)
 */
public record DesktopAiStateResponse(boolean configured, boolean reachable, List<String> models,
                                     List<String> embedModels, Chat chat, Embeddings embeddings) {

    public record Chat(String model, @JsonProperty("model_fast") String modelFast, boolean available) {
    }

    public record Embeddings(String model, int dimensions, boolean available) {
    }
}
