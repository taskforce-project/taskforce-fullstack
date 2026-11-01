package com.taskforce.tf_api.core.service.ai;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Le format d'une API compatible OpenAI ({@code /chat/completions}, {@code /embeddings}), celui que le backend parle
 * aussi en interne : les messages de la boucle d'agent sont déjà à ce format.
 */
final class OpenAiProtocol {

    /** Directive propre à Qwen3 : une réponse sans raisonnement, bien plus rapide. Tout autre modèle la lirait comme du texte. */
    static final String NO_THINK = "/no_think";
    private static final Pattern THINK_BLOCK = Pattern.compile("<think>.*?</think>\\s*", Pattern.DOTALL);

    private OpenAiProtocol() {
    }

    /** Vrai pour un modèle Qwen3 ({@code qwen3:8b}, {@code qwen/qwen3-32b}...), seul à comprendre {@code /no_think}. */
    static boolean isQwen3(String model) {
        return model != null && model.toLowerCase(Locale.ROOT).contains("qwen3");
    }

    /**
     * Les messages envoyés : une copie, sans le contenu propre à Anthropic qu'un message assistant peut porter (une
     * conversation commencée avant un changement de fournisseur), avec {@code /no_think} au dernier quand un modèle
     * Qwen3 ne doit pas raisonner. La liste de l'appelant n'est jamais modifiée.
     */
    static ArrayNode messages(ObjectMapper mapper, List<?> messages, String model, boolean think) {
        ArrayNode out = mapper.valueToTree(messages);
        for (JsonNode message : out) {
            if (message instanceof ObjectNode object) {
                object.remove(AnthropicProtocol.PROVIDER_CONTENT);
            }
        }
        if (!think && !out.isEmpty() && isQwen3(model) && out.get(out.size() - 1) instanceof ObjectNode last) {
            JsonNode content = last.get("content");
            if (content == null || content.isNull() || content.isTextual()) {
                String text = content == null || content.isNull() ? "" : content.asText().stripTrailing();
                if (!text.contains(NO_THINK)) {
                    last.put("content", (text + " " + NO_THINK).strip());
                }
            }
        }
        return out;
    }

    /** Retire un bloc {@code <think>...</think>} resté dans la réponse : les appelants attendent la réponse seule, parfois un JSON. */
    static ObjectNode stripThinking(ObjectNode message) {
        JsonNode content = message.get("content");
        if (content != null && content.isTextual() && content.asText().contains("<think>")) {
            message.put("content", THINK_BLOCK.matcher(content.asText()).replaceAll("").strip());
        }
        return message;
    }

    /** Les vecteurs d'une réponse {@code /embeddings}, dans l'ordre des textes, de la dimension de la base. */
    static List<float[]> vectors(JsonNode payload, int count, String model, int dimensions) {
        JsonNode data = payload.path("data");
        if (!data.isArray() || data.size() != count) {
            throw new ModelProviderException("Invalid embeddings response");
        }
        List<JsonNode> rows = new ArrayList<>();
        data.forEach(rows::add);
        rows.sort(Comparator.comparingInt(row -> row.path("index").asInt(0)));
        List<float[]> vectors = new ArrayList<>(rows.size());
        for (JsonNode row : rows) {
            JsonNode embedding = row.path("embedding");
            float[] vector = new float[embedding.size()];
            for (int i = 0; i < vector.length; i++) {
                vector[i] = (float) embedding.get(i).asDouble();
            }
            if (vector.length != dimensions) {
                throw new ModelProviderException("Embedding model " + model + " returns " + vector.length
                    + " dimensions, the database expects " + dimensions);
            }
            vectors.add(vector);
        }
        return vectors;
    }
}
