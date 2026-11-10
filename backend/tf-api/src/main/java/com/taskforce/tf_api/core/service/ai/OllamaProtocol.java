package com.taskforce.tf_api.core.service.ai;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.service.LlmUsage;

/**
 * L'API d'Ollama ({@code /api/chat}), que la passerelle prend pour converser avec Ollama : seule elle laisse choisir la
 * fenêtre de contexte d'une requête ({@code options.num_ctx}). Son API compatible OpenAI ignore ce réglage (vérifié sur
 * Ollama 0.40.14 le 05/11/2026, à la racine comme dans {@code options}) : Ollama s'en tient alors à 4 096 jetons et
 * coupe le début du prompt, les consignes de Cortex comprises.
 *
 * <p>Le backend garde les messages et les outils au format OpenAI ; ils sont traduits ici, à l'aller et au retour.</p>
 */
final class OllamaProtocol {

    /** La plus petite fenêtre demandée : le prompt de Cortex (3 300 à 3 700 jetons avec l'écran) et sa réponse y tiennent. */
    static final int MINIMUM_WINDOW = 8_192;

    private OllamaProtocol() {
    }

    /** L'adresse de l'API d'Ollama : celle des réglages, sans {@code /v1}. */
    static String nativeBase(String baseUrl) {
        return baseUrl.replaceAll("/v1$", "");
    }

    /**
     * Les jetons que la requête demande à la fenêtre : son prompt estimé et la place de la réponse, celle que le budget de
     * la requête garde ({@link ContextBudget#answerRoom}) dans la plus grande fenêtre que ce modèle reçoit.
     */
    static int needed(int tokens, boolean think, int ceiling) {
        return (int) Math.min(Integer.MAX_VALUE, (long) tokens + ContextBudget.answerRoom(ceiling, think));
    }

    /**
     * La fenêtre d'une requête : ce qu'elle demande, arrondi à la puissance de deux au-dessus (8 192 au moins : peu de
     * tailles différentes, donc peu de rechargements), au plus {@code ceiling}. Un modèle déjà chargé avec une fenêtre
     * qui tient la requête la garde : Ollama recharge le modèle à chaque changement de fenêtre (3,2 à 4,2 s pour
     * qwen3:8b, mesuré le 05/11/2026).
     *
     * @param needed  les jetons que demande la requête ({@link #needed})
     * @param ceiling {@code AI_OLLAMA_MAX_CONTEXT}, ou le maximum du modèle s'il est plus petit
     * @param loaded  la fenêtre du modèle chargé, 0 s'il ne l'est pas
     */
    static int window(int needed, int ceiling, int loaded) {
        long window = MINIMUM_WINDOW;
        while (window < needed && window < ceiling) {
            window <<= 1;
        }
        int sized = (int) Math.min(window, ceiling);
        return loaded >= sized && loaded <= ceiling ? loaded : sized;
    }

    /** La plus grande fenêtre que reçoit un modèle : le plafond des réglages, ou son maximum s'il est plus petit (0 : inconnu). */
    static int ceiling(int setting, int modelMaximum) {
        return modelMaximum > 0 ? Math.min(setting, modelMaximum) : setting;
    }

    /**
     * La requête, sans ses outils ni sa fenêtre, que la passerelle pose à chaque essai. Qwen3 sans raisonnement reçoit
     * {@code /no_think} et le réglage natif {@code think: false} ; un autre modèle, ou le palier qui raisonne, rien.
     */
    static ObjectNode request(ObjectMapper mapper, List<?> messages, String model, boolean think, boolean jsonMode,
                              double temperature) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.set("messages", messages(mapper, messages, model, think));
        body.put("stream", false);
        if (!think && OpenAiProtocol.isQwen3(model)) {
            body.put("think", false);
        }
        if (jsonMode) {
            body.put("format", "json");
        }
        body.putObject("options").put("temperature", temperature);
        return body;
    }

    /**
     * Les messages au format d'Ollama : les arguments d'un appel d'outil sont un objet (une chaîne fait refuser la
     * requête), le résultat d'un outil dit son nom, un contenu est toujours du texte. La liste de l'appelant n'est jamais
     * modifiée.
     */
    static ArrayNode messages(ObjectMapper mapper, List<?> messages, String model, boolean think) {
        ArrayNode out = OpenAiProtocol.messages(mapper, messages, model, think);
        Map<String, String> toolNames = new HashMap<>();
        for (JsonNode node : out) {
            if (!(node instanceof ObjectNode message)) {
                continue;
            }
            JsonNode content = message.get("content");
            if (content == null || content.isNull()) {
                message.put("content", "");
            } else if (content.isArray()) {
                message.put("content", text(content));
            }
            for (JsonNode call : message.path("tool_calls")) {
                if (call instanceof ObjectNode toolCall && toolCall.get("function") instanceof ObjectNode function) {
                    toolCall.remove("type");
                    JsonNode arguments = function.get("arguments");
                    if (arguments != null && arguments.isTextual()) {
                        function.set("arguments", arguments(mapper, arguments.asText()));
                    }
                    toolNames.put(toolCall.path("id").asText(""), function.path("name").asText(""));
                }
            }
            if ("tool".equals(message.path("role").asText()) && !message.has("tool_name")) {
                String name = toolNames.get(message.path("tool_call_id").asText(""));
                if (name != null && !name.isEmpty()) {
                    message.put("tool_name", name);
                }
            }
        }
        return out;
    }

    /**
     * Le message de la réponse, au format OpenAI que lisent les appelants : son texte, et ses appels d'outils avec des
     * arguments en chaîne. Le raisonnement qu'Ollama rend à part ({@code thinking}) n'en fait pas partie.
     */
    static ObjectNode message(ObjectMapper mapper, JsonNode payload) {
        if (!(payload.path("message") instanceof ObjectNode answer)) {
            throw new ModelProviderException("AI provider answered without a message");
        }
        ObjectNode message = mapper.createObjectNode();
        message.put("role", "assistant");
        message.put("content", answer.path("content").asText(""));
        JsonNode calls = answer.path("tool_calls");
        if (calls.isArray() && !calls.isEmpty()) {
            ArrayNode out = message.putArray("tool_calls");
            for (JsonNode call : calls) {
                JsonNode function = call.path("function");
                JsonNode arguments = function.path("arguments");
                String id = call.path("id").asText("");
                ObjectNode toolCall = out.addObject();
                // Un appel sans identifiant (une version d'Ollama qui n'en donne pas) en reçoit un : le résultat s'y rattache.
                toolCall.put("id", id.isEmpty() ? "call_" + UUID.randomUUID().toString().substring(0, 8) : id);
                toolCall.put("type", "function");
                ObjectNode named = toolCall.putObject("function");
                named.put("name", function.path("name").asText(""));
                named.put("arguments", arguments.isTextual() ? arguments.asText()
                    : arguments.isObject() ? arguments.toString() : "{}");
            }
        }
        return message;
    }

    /** L'usage d'une réponse : les jetons du prompt et ceux de la réponse. */
    static LlmUsage usage(JsonNode payload) {
        long prompt = payload.path("prompt_eval_count").asLong(0);
        long completion = payload.path("eval_count").asLong(0);
        return new LlmUsage(prompt, completion, prompt + completion);
    }

    /**
     * Le maximum d'un modèle, dans la réponse de {@code /api/show} : {@code model_info["<architecture>.context_length"]}
     * ({@code qwen3.context_length} vaut 40 960 pour qwen3:8b) ; 0 s'il n'y est pas.
     */
    static int contextLength(JsonNode show) {
        JsonNode info = show.path("model_info");
        JsonNode length = info.path(info.path("general.architecture").asText("") + ".context_length");
        if (!length.isNumber()) {
            for (Map.Entry<String, JsonNode> field : info.properties()) {
                if (field.getKey().endsWith(".context_length") && field.getValue().isNumber()) {
                    length = field.getValue();
                    break;
                }
            }
        }
        return length.isNumber() && length.asInt() > 0 ? length.asInt() : 0;
    }

    /**
     * Ce que la fiche d'un modèle dit de lui, dans la réponse de {@code /api/show} (R113, R125, R142) : sa taille
     * ({@code details.parameter_size}, « 8.2B »), sa fenêtre de contexte, s'il prend des outils ({@code capabilities},
     * qu'Ollama donne depuis 0.6 ; {@code null} quand la fiche ne le dit pas), sa famille, et s'il sait converser. Une
     * description, jamais une mesure.
     */
    static ModelGateway.ModelCard card(JsonNode show) {
        JsonNode details = show.path("details");
        String size = details.path("parameter_size").asText("").strip();
        String family = details.path("family").asText("").strip();
        int window = contextLength(show);
        JsonNode capabilities = show.path("capabilities");
        Boolean tools = null;
        if (capabilities.isArray()) {
            tools = false;
            for (JsonNode capability : capabilities) {
                if ("tools".equals(capability.asText())) tools = true;
            }
        }
        return new ModelGateway.ModelCard(size.isEmpty() ? null : size, window > 0 ? window : null, tools,
            family.isEmpty() ? null : family, chats(show, tools), null);
    }

    /**
     * Le modèle sait-il converser ? Un modèle de base (qwen2.5-coder:7b-base : {@code ["completion","insert"]}, un gabarit
     * qui ne parle que de {@code .Prompt} et {@code .Suffix}) complète du texte : il répond à côté, sans outil (vérifié le
     * 09/11/2026 sur les sept modèles de la Présidence). Un modèle qui prend des outils converse, même quand son gabarit ne
     * nomme pas les messages (qwen3.5:9b, rendu par Ollama lui-même) ; sinon, c'est son gabarit qui le dit. {@code null}
     * quand la fiche ne donne pas ses capacités (Ollama avant 0.6) : on ne sait pas, on essaie.
     */
    static Boolean chats(JsonNode show, Boolean tools) {
        if (tools == null) return null;
        if (tools) return true;
        String template = show.path("template").asText("");
        return template.contains(".Messages") || template.contains(".System");
    }

    /** La requête qui charge un modèle sans lui rien demander : une conversation sans message, à cette fenêtre. */
    static ObjectNode loadRequest(ObjectMapper mapper, String model, int window) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.putArray("messages");
        body.put("stream", false);
        body.putObject("options").put("num_ctx", window);
        return body;
    }

    /** La fenêtre du modèle chargé, dans la réponse de {@code /api/ps} ; 0 s'il n'est pas chargé. */
    static int loadedWindow(JsonNode ps, String model) {
        JsonNode row = loadedRow(ps, model);
        return row == null ? 0 : Math.max(0, row.path("context_length").asInt(0));
    }

    /** Où tient le modèle chargé, dans la réponse de {@code /api/ps} : sa mémoire et ce qui en tient sur la carte graphique. */
    static ModelGateway.LoadedModel loaded(JsonNode ps, String model) {
        JsonNode row = loadedRow(ps, model);
        if (row == null) return new ModelGateway.LoadedModel(0, 0);
        return new ModelGateway.LoadedModel(Math.max(0, row.path("size").asLong(0)), Math.max(0, row.path("size_vram").asLong(0)));
    }

    private static JsonNode loadedRow(JsonNode ps, String model) {
        for (JsonNode row : ps.path("models")) {
            String name = row.path("name").asText("");
            String id = row.path("model").asText("");
            if (name.equals(model) || id.equals(model) || name.equals(model + ":latest") || id.equals(model + ":latest")) {
                return row;
            }
        }
        return null;
    }

    /** La place sur le disque de chaque modèle installé, dans la réponse de {@code /api/tags}, en octets. */
    static Map<String, Long> diskSizes(JsonNode tags) {
        Map<String, Long> sizes = new HashMap<>();
        for (JsonNode row : tags.path("models")) {
            String name = row.path("name").asText("");
            long size = row.path("size").asLong(0);
            if (!name.isEmpty() && size > 0) sizes.put(name, size);
        }
        return sizes;
    }

    /** Les arguments d'un appel d'outil, en objet ; illisibles ou d'une autre forme, un objet vide. */
    private static JsonNode arguments(ObjectMapper mapper, String text) {
        try {
            JsonNode parsed = mapper.readTree(text.isBlank() ? "{}" : text);
            return parsed != null && parsed.isObject() ? parsed : mapper.createObjectNode();
        } catch (JsonProcessingException unreadable) {
            return mapper.createObjectNode();
        }
    }

    /** Le texte d'un contenu en parties ({@code [{type: "text", text}]}). */
    private static String text(JsonNode parts) {
        StringBuilder text = new StringBuilder();
        for (JsonNode part : parts) {
            String piece = part.isTextual() ? part.asText() : part.path("text").asText("");
            if (!piece.isEmpty()) {
                text.append(text.isEmpty() ? "" : "\n").append(piece);
            }
        }
        return text.toString();
    }
}
