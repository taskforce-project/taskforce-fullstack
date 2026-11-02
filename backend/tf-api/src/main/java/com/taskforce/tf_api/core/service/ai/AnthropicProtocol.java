package com.taskforce.tf_api.core.service.ai;

import java.util.List;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * L'API Messages d'Anthropic ({@code POST /v1/messages}), traduite depuis et vers le format compatible OpenAI que le
 * backend parle en interne. Les appelants ne savent pas quel fournisseur répond.
 *
 * <ul>
 *   <li>Les messages {@code system} deviennent le champ {@code system} ; un message {@code tool} devient un bloc
 *       {@code tool_result} d'un message {@code user} ; deux messages de suite du même rôle n'en font qu'un.</li>
 *   <li>Les outils ({@code {type: function, function: {name, description, parameters}}}) deviennent
 *       {@code {name, description, input_schema}}, avec {@code tool_choice: auto} : les modèles récents refusent un
 *       outil imposé.</li>
 *   <li>Une réponse qui appelle des outils garde son contenu d'origine ({@link #PROVIDER_CONTENT}) : la boucle d'agent le
 *       renvoie avec les résultats, et les blocs de raisonnement doivent revenir tels quels, signature comprise.</li>
 *   <li>Pas de mode JSON chez Anthropic, ni de réponse préremplie sur les modèles récents : la consigne passe dans
 *       {@code system}, et l'objet JSON est extrait de la réponse.</li>
 *   <li>Ni {@code temperature} ni réglage du raisonnement : les modèles récents les refusent ou décident seuls
 *       (raisonnement adaptatif). Le palier « deep » n'y change donc rien.</li>
 * </ul>
 */
final class AnthropicProtocol {

    /**
     * Version de l'API. Les requêtes n'emploient rien de ce que la version {@code 2026-10-21} change (échantillonnage,
     * documents, citations) : l'ancienne date, comprise partout, y compris par les relais compatibles, suffit.
     */
    static final String VERSION = "2023-06-01";
    /** Champ du message assistant qui garde le contenu d'origine d'Anthropic, pour le tour suivant de la boucle. */
    static final String PROVIDER_CONTENT = "_anthropic_content";
    static final String JSON_INSTRUCTION =
        "Answer with one valid JSON object and nothing else: no text before or after it, no code fence.";
    static final String REFUSAL = "The model declined to answer this request.";

    private AnthropicProtocol() {
    }

    /** Le corps d'une requête {@code /messages}. */
    static ObjectNode request(ObjectMapper mapper, List<?> messages, List<JsonNode> tools, String model, int maxTokens,
                              boolean jsonMode) {
        ArrayNode input = mapper.valueToTree(messages);
        StringBuilder system = new StringBuilder();
        ArrayNode out = mapper.createArrayNode();
        for (JsonNode message : input) {
            switch (message.path("role").asText("")) {
                case "system" -> paragraph(system, text(message.get("content")));
                case "assistant" -> append(mapper, out, "assistant", assistantBlocks(mapper, message));
                case "tool" -> append(mapper, out, "user", toolResult(mapper, message));
                default -> append(mapper, out, "user", textBlock(mapper, text(message.get("content"))));
            }
        }
        if (jsonMode) {
            paragraph(system, JSON_INSTRUCTION);
        }
        // La conversation commence par la personne : un historique tronqué qui s'ouvre sur une réponse la perd.
        while (!out.isEmpty() && "assistant".equals(out.get(0).path("role").asText())) {
            out.remove(0);
        }
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.put("max_tokens", maxTokens);
        if (!system.isEmpty()) {
            body.put("system", system.toString());
        }
        body.set("messages", out);
        if (!tools.isEmpty()) {
            ArrayNode converted = body.putArray("tools");
            tools.forEach(tool -> converted.add(tool(mapper, tool)));
            body.putObject("tool_choice").put("type", "auto");
        }
        return body;
    }

    /** Une définition d'outil au format OpenAI, au format d'Anthropic. */
    static ObjectNode tool(ObjectMapper mapper, JsonNode tool) {
        JsonNode function = tool.has("function") ? tool.get("function") : tool;
        ObjectNode out = mapper.createObjectNode();
        out.put("name", function.path("name").asText(""));
        String description = function.path("description").asText("");
        if (!description.isBlank()) {
            out.put("description", description);
        }
        JsonNode parameters = function.get("parameters");
        ObjectNode schema = parameters instanceof ObjectNode object ? object.deepCopy() : mapper.createObjectNode();
        // Anthropic exige un schéma d'objet, même pour un outil sans paramètre.
        if (!schema.has("type")) {
            schema.put("type", "object");
        }
        if ("object".equals(schema.path("type").asText()) && !schema.has("properties")) {
            schema.putObject("properties");
        }
        out.set("input_schema", schema);
        return out;
    }

    /** Le message assistant, au format OpenAI, d'une réponse d'Anthropic. */
    static ObjectNode message(ObjectMapper mapper, JsonNode payload, boolean jsonMode) {
        JsonNode content = payload.path("content");
        if (!content.isArray()) {
            throw new ModelProviderException("AI provider answered without content");
        }
        StringBuilder text = new StringBuilder();
        ArrayNode calls = mapper.createArrayNode();
        boolean afterOtherBlock = false;
        for (JsonNode block : content) {
            String type = block.path("type").asText("");
            if ("text".equals(type)) {
                if (afterOtherBlock && !text.isEmpty()) {
                    text.append("\n\n");
                }
                text.append(block.path("text").asText(""));
                afterOtherBlock = false;
                continue;
            }
            afterOtherBlock = true;
            if ("tool_use".equals(type)) {
                ObjectNode call = calls.addObject();
                call.put("id", block.path("id").asText(""));
                call.put("type", "function");
                ObjectNode function = call.putObject("function");
                function.put("name", block.path("name").asText(""));
                function.put("arguments", json(mapper, block.has("input") ? block.get("input") : mapper.createObjectNode()));
            }
            // Raisonnement (thinking, redacted_thinking) : gardé dans le contenu d'origine seulement.
        }
        String answer = jsonMode ? jsonObject(mapper, text.toString().strip()) : text.toString().strip();
        if (answer.isEmpty() && calls.isEmpty() && "refusal".equals(payload.path("stop_reason").asText())) {
            answer = REFUSAL;
        }
        ObjectNode message = mapper.createObjectNode();
        message.put("role", "assistant");
        message.put("content", answer);
        if (!calls.isEmpty()) {
            message.set("tool_calls", calls);
            message.set(PROVIDER_CONTENT, content.deepCopy());
        }
        return message;
    }

    /** L'usage d'une réponse, au format OpenAI ; les jetons lus ou écrits dans le cache comptent comme entrée. */
    static ObjectNode usage(ObjectMapper mapper, JsonNode payload) {
        JsonNode usage = payload.path("usage");
        long input = usage.path("input_tokens").asLong(0)
            + usage.path("cache_creation_input_tokens").asLong(0)
            + usage.path("cache_read_input_tokens").asLong(0);
        long output = usage.path("output_tokens").asLong(0);
        ObjectNode out = mapper.createObjectNode();
        out.put("prompt_tokens", input);
        out.put("completion_tokens", output);
        out.put("total_tokens", input + output);
        return out;
    }

    /**
     * Retire les blocs de raisonnement de l'historique : le recours documenté quand Anthropic refuse un bloc dont la
     * conversation a changé (une requête refaite avec moins d'outils, par exemple). Le tour répond alors sans eux.
     */
    static boolean dropThinking(ObjectNode body) {
        boolean dropped = false;
        for (JsonNode message : body.path("messages")) {
            if (message.path("content") instanceof ArrayNode blocks) {
                for (int i = blocks.size() - 1; i >= 0; i--) {
                    String type = blocks.get(i).path("type").asText("");
                    if ("thinking".equals(type) || "redacted_thinking".equals(type)) {
                        blocks.remove(i);
                        dropped = true;
                    }
                }
            }
        }
        return dropped;
    }

    /**
     * L'objet JSON d'une réponse en mode JSON : tel quel s'il se lit, sinon débarrassé d'une clôture de code ou du texte
     * autour. Une réponse sans objet lisible est rendue telle quelle : l'appelant passe à son repli.
     */
    static String jsonObject(ObjectMapper mapper, String answer) {
        if (readsAsJson(mapper, answer)) {
            return answer;
        }
        int start = answer.indexOf('{');
        int end = answer.lastIndexOf('}');
        if (start >= 0 && end > start) {
            String candidate = answer.substring(start, end + 1);
            if (readsAsJson(mapper, candidate)) {
                return candidate;
            }
        }
        return answer;
    }

    private static boolean readsAsJson(ObjectMapper mapper, String text) {
        try {
            return !text.isEmpty() && mapper.readTree(text).isObject();
        } catch (JsonProcessingException notJson) {
            return false;
        }
    }

    private static ArrayNode assistantBlocks(ObjectMapper mapper, JsonNode message) {
        JsonNode original = message.get(PROVIDER_CONTENT);
        if (original instanceof ArrayNode blocks && !blocks.isEmpty()) {
            return blocks.deepCopy();
        }
        ArrayNode blocks = textBlock(mapper, text(message.get("content")));
        for (JsonNode call : message.path("tool_calls")) {
            ObjectNode use = blocks.addObject();
            use.put("type", "tool_use");
            use.put("id", call.path("id").asText(""));
            use.put("name", call.path("function").path("name").asText(""));
            use.set("input", arguments(mapper, call.path("function").get("arguments")));
        }
        return blocks;
    }

    private static ArrayNode toolResult(ObjectMapper mapper, JsonNode message) {
        ArrayNode blocks = mapper.createArrayNode();
        ObjectNode result = blocks.addObject();
        result.put("type", "tool_result");
        result.put("tool_use_id", message.path("tool_call_id").asText(""));
        String content = text(message.get("content"));
        result.put("content", content.isBlank() ? "(no output)" : content);
        return blocks;
    }

    /** Un bloc de texte ; aucun pour un texte vide, qu'Anthropic refuse. */
    private static ArrayNode textBlock(ObjectMapper mapper, String text) {
        ArrayNode blocks = mapper.createArrayNode();
        if (!text.isBlank()) {
            blocks.addObject().put("type", "text").put("text", text);
        }
        return blocks;
    }

    /** Ajoute des blocs ; au message précédent quand il a le même rôle (les rôles doivent alterner). */
    private static void append(ObjectMapper mapper, ArrayNode out, String role, ArrayNode blocks) {
        if (blocks.isEmpty()) {
            return;
        }
        JsonNode last = out.isEmpty() ? null : out.get(out.size() - 1);
        if (last != null && role.equals(last.path("role").asText()) && last.get("content") instanceof ArrayNode content) {
            content.addAll(blocks);
            return;
        }
        ObjectNode message = out.addObject();
        message.put("role", role);
        message.set("content", blocks);
    }

    /** Arguments d'un appel d'outil : la chaîne JSON du format OpenAI, ou déjà un objet. */
    private static JsonNode arguments(ObjectMapper mapper, JsonNode arguments) {
        if (arguments != null && arguments.isObject()) {
            return arguments;
        }
        if (arguments != null && arguments.isTextual()) {
            try {
                JsonNode parsed = mapper.readTree(arguments.asText());
                if (parsed != null && parsed.isObject()) {
                    return parsed;
                }
            } catch (JsonProcessingException unreadable) {
                // un appel mal formé garde un objet vide : le modèle verra le résultat de l'outil
            }
        }
        return mapper.createObjectNode();
    }

    /** Texte d'un contenu : une chaîne, ou les parties texte d'un contenu en plusieurs parties. */
    private static String text(JsonNode content) {
        if (content == null || content.isNull()) {
            return "";
        }
        if (content.isTextual()) {
            return content.asText();
        }
        if (content.isArray()) {
            StringBuilder text = new StringBuilder();
            content.forEach(part -> text.append(part.path("text").asText("")));
            return text.toString();
        }
        return content.asText("");
    }

    private static void paragraph(StringBuilder system, String text) {
        if (text.isBlank()) {
            return;
        }
        if (!system.isEmpty()) {
            system.append("\n\n");
        }
        system.append(text);
    }

    private static String json(ObjectMapper mapper, JsonNode node) {
        try {
            return mapper.writeValueAsString(node);
        } catch (JsonProcessingException impossible) {
            return "{}";
        }
    }
}
