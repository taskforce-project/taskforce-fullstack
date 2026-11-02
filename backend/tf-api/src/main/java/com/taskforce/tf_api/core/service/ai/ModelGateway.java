package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.extern.slf4j.Slf4j;

/**
 * La passerelle de modèles (R92, TF-J1-2) : le seul endroit du backend qui parle à un fournisseur d'IA. Ollama, toute API
 * compatible OpenAI et l'API d'Anthropic ; la conversation avec outils, les vecteurs et la liste des modèles.
 *
 * <p>Elle remplace l'ai-service Python et le relais d'IA de la coque de l'app desktop, et reprend leur comportement :</p>
 * <ul>
 *   <li>{@code /no_think} au dernier message d'un modèle Qwen3 qui ne doit pas raisonner, et sur Ollama le réglage natif
 *       {@code reasoning_effort: "none"}, qu'Ollama 0.40 suit quand il ignore la directive (même appel d'outil : 2,9 s
 *       puis 0,5 s, mesuré le 29/10/2026) ;</li>
 *   <li>un bloc {@code <think>} resté dans une réponse est retiré ;</li>
 *   <li>un refus 400 ou 413 avec des outils : on redemande avec moitié moins d'outils (un serveur MCP riche dépasse la
 *       taille admise, ou expose un schéma refusé ; le backend les envoie triés par pertinence, on garde le début). Jamais
 *       jusqu'à zéro : sans outils, le modèle annonçait des actions qu'il n'avait pas faites (recette du 29/10/2026) ;</li>
 *   <li>le 400 {@code tool_use_failed} de Groq (un appel d'outil mal formé par le modèle) se redemande une fois tel
 *       quel : c'est un tirage raté, pas un outil de trop ;</li>
 *   <li>un en-tête {@code User-Agent} applicatif : Groq est derrière Cloudflare, qui refuse celui d'un client par défaut ;</li>
 *   <li>des vecteurs de 1024 dimensions, la taille de la colonne {@code knowledge_nodes.embedding}.</li>
 * </ul>
 *
 * <p>Les réglages sont passés à chaque appel ({@link AiProviderSettings}) : un changement fait dans l'app desktop vaut
 * dès l'appel suivant. Aucune clé n'est écrite dans un journal.</p>
 */
@Component
@Slf4j
public class ModelGateway {

    /** Dimension de la colonne pgvector {@code knowledge_nodes.embedding vector(1024)} (V59). */
    public static final int EMBEDDING_DIM = 1024;
    static final String USER_AGENT = "TaskForce-AI/1.0";
    /** Délai d'une liste de modèles : la sonde de l'état de l'IA ne doit pas faire attendre. */
    static final Duration PROBE_TIMEOUT = Duration.ofSeconds(3);
    private static final double TEMPERATURE = 0.4;

    private final ObjectMapper mapper;
    private final ModelHttp http;

    @Autowired
    public ModelGateway(ObjectMapper mapper) {
        this(mapper, ModelHttp.jdk());
    }

    ModelGateway(ObjectMapper mapper, ModelHttp http) {
        this.mapper = mapper;
        this.http = http;
    }

    /**
     * Une demande de conversation.
     *
     * @param messages au format OpenAI ({@code {role, content}}, appels et résultats d'outils)
     * @param tools    définitions d'outils au format OpenAI, triées par pertinence ; vide sans outils
     * @param jsonMode la réponse doit être un objet JSON
     * @param model    le modèle qui répond
     * @param think    le modèle peut raisonner (palier « deep »)
     */
    public record ChatCall(List<?> messages, List<Map<String, Object>> tools, boolean jsonMode, String model,
                           boolean think) {
    }

    /** La réponse : le modèle qui a répondu, le message assistant (qui peut porter des {@code tool_calls}), l'usage. */
    public record ChatReply(String model, ObjectNode message, LlmUsage usage) {
    }

    /** Une conversation, chez le fournisseur des réglages. */
    public ChatReply chat(AiProviderSettings settings, ChatCall call) {
        if (!settings.enabled()) {
            throw new ModelProviderException("AI is turned off on this instance (AI_PROVIDER=none)");
        }
        if (call.model() == null || call.model().isBlank()) {
            throw new ModelProviderException("No AI model is set up");
        }
        List<JsonNode> tools = new ArrayList<>();
        if (call.tools() != null) {
            call.tools().forEach(tool -> tools.add(mapper.valueToTree(tool)));
        }
        return settings.provider() == AiProvider.ANTHROPIC ? anthropic(settings, call, tools) : openAi(settings, call, tools);
    }

    /** Vecteurs des textes, dans l'ordre, chez le fournisseur des vecteurs. */
    public List<float[]> embed(AiProviderSettings settings, String model, List<String> texts) {
        if (!settings.enabled()) {
            throw new ModelProviderException("AI is turned off on this instance (AI_PROVIDER=none)");
        }
        if (texts.isEmpty()) {
            return List.of();
        }
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        ArrayNode input = body.putArray("input");
        texts.forEach(input::add);
        ModelHttp.Reply reply;
        try {
            reply = http.send("POST", settings.embedBaseUrl() + "/embeddings",
                openAiHeaders(settings.embedApiKey()), write(body), settings.timeout());
        } catch (IOException unreachable) {
            throw new ModelProviderException("Embeddings unreachable: " + reason(unreachable), unreachable);
        }
        if (!reply.ok()) {
            throw new ModelProviderException("Embeddings refused (HTTP " + reply.status() + ")");
        }
        return OpenAiProtocol.vectors(read(reply.body()), texts.size(), model, EMBEDDING_DIM);
    }

    /** Les modèles que la conversation annonce ; vide si le fournisseur ne répond pas. */
    public Optional<List<String>> chatModels(AiProviderSettings settings) {
        if (settings.provider() == AiProvider.ANTHROPIC) {
            // Toute la liste d'un coup : sans limite, Anthropic n'en rend que vingt.
            return models(settings.baseUrl() + "/models?limit=1000", anthropicHeaders(settings.apiKey()));
        }
        return models(settings.baseUrl() + "/models", openAiHeaders(settings.apiKey()));
    }

    /** Les modèles que le fournisseur des vecteurs annonce ; vide s'il ne répond pas. */
    public Optional<List<String>> embedModels(AiProviderSettings settings) {
        return models(settings.embedBaseUrl() + "/models", openAiHeaders(settings.embedApiKey()));
    }

    // -------------------------------------------------------------------------
    // API compatible OpenAI (Ollama compris)
    // -------------------------------------------------------------------------

    private ChatReply openAi(AiProviderSettings settings, ChatCall call, List<JsonNode> tools) {
        String model = call.model();
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.set("messages", OpenAiProtocol.messages(mapper, call.messages(), model, call.think()));
        body.put("temperature", TEMPERATURE);
        body.put("stream", false);
        if (call.jsonMode()) {
            body.putObject("response_format").put("type", "json_object");
        }
        if (!call.think() && settings.provider() == AiProvider.OLLAMA && OpenAiProtocol.isQwen3(model)) {
            // Ollama ignore /no_think : son réglage natif coupe le raisonnement. Ailleurs, il n'est pas garanti.
            body.put("reasoning_effort", "none");
        }
        String url = settings.baseUrl() + "/chat/completions";
        Map<String, String> headers = openAiHeaders(settings.apiKey());
        List<JsonNode> attempt = tools;
        boolean retriedGeneration = false;
        while (true) {
            withTools(body, attempt, false);
            ModelHttp.Reply reply = send(url, headers, body, settings.timeout());
            if (reply.ok()) {
                JsonNode payload = read(reply.body());
                JsonNode choices = payload.path("choices");
                if (!choices.isArray() || choices.isEmpty() || !(choices.get(0).path("message") instanceof ObjectNode message)) {
                    throw new ModelProviderException("AI provider answered without choices");
                }
                return new ChatReply(model, OpenAiProtocol.stripThinking(message), usage(payload.path("usage")));
            }
            if (reply.status() == 400 && !attempt.isEmpty() && !retriedGeneration && reply.body().contains("tool_use_failed")) {
                // Groq refuse une réponse où le modèle a mal formé un appel d'outil : on redemande une fois, mêmes outils.
                log.warn("AI provider rejected a malformed tool call from the model: asking again");
                retriedGeneration = true;
                continue;
            }
            if ((reply.status() == 400 || reply.status() == 413) && !attempt.isEmpty()) {
                attempt = fewerTools(reply.status(), attempt);
                continue;
            }
            throw new ModelProviderException("AI provider refused the request (HTTP " + reply.status() + ")");
        }
    }

    // -------------------------------------------------------------------------
    // API Messages d'Anthropic
    // -------------------------------------------------------------------------

    private ChatReply anthropic(AiProviderSettings settings, ChatCall call, List<JsonNode> tools) {
        String url = settings.baseUrl() + "/messages";
        Map<String, String> headers = anthropicHeaders(settings.apiKey());
        ObjectNode body = AnthropicProtocol.request(mapper, call.messages(), List.of(), call.model(),
            settings.maxTokens(), call.jsonMode());
        List<JsonNode> attempt = tools;
        boolean thinkingDropped = false;
        while (true) {
            withTools(body, attempt, true);
            ModelHttp.Reply reply = send(url, headers, body, settings.timeout());
            if (reply.ok()) {
                JsonNode payload = read(reply.body());
                return new ChatReply(call.model(), AnthropicProtocol.message(mapper, payload, call.jsonMode()),
                    usage(AnthropicProtocol.usage(mapper, payload)));
            }
            String error = errorMessage(reply.body());
            if (reply.status() == 400 && !thinkingDropped && error.contains("signature")
                && AnthropicProtocol.dropThinking(body)) {
                // Un bloc de raisonnement lié à une conversation qui a changé : on le retire, comme la doc le prévoit.
                log.warn("AI provider refused a reasoning block of the conversation: asking again without them");
                thinkingDropped = true;
                continue;
            }
            // Un 400 d'Anthropic dit sa raison : seul un refus qui parle des outils les réduit.
            boolean aboutTools = reply.status() == 413 || (reply.status() == 400 && error.toLowerCase(Locale.ROOT).contains("tool"));
            if (aboutTools && !attempt.isEmpty()) {
                attempt = fewerTools(reply.status(), attempt);
                continue;
            }
            log.warn("AI provider refused the request (HTTP {}): {}", reply.status(), LogSafe.of(error));
            throw new ModelProviderException("AI provider refused the request (HTTP " + reply.status() + ")");
        }
    }

    // -------------------------------------------------------------------------
    // Commun
    // -------------------------------------------------------------------------

    /**
     * Moitié moins d'outils, jamais zéro. Un 413 qui reste avec un seul outil vient de la conversation, pas des outils.
     */
    private static List<JsonNode> fewerTools(int status, List<JsonNode> tools) {
        int keep = tools.size() / 2;
        if (keep == 0) {
            log.error("AI provider answered {} even with a single tool", status);
            if (status == 413) {
                throw new ModelProviderException("AI provider: the request is too large (HTTP 413)");
            }
            throw new ModelProviderException.ToolsRefused("AI provider refused the tools (HTTP " + status + ")");
        }
        log.warn("AI provider answered {} with {} tool(s), retrying with {}", status, tools.size(), keep);
        return tools.subList(0, keep);
    }

    private void withTools(ObjectNode body, List<JsonNode> tools, boolean anthropic) {
        if (tools.isEmpty()) {
            body.remove("tools");
            body.remove("tool_choice");
            return;
        }
        ArrayNode array = body.putArray("tools");
        if (anthropic) {
            tools.forEach(tool -> array.add(AnthropicProtocol.tool(mapper, tool)));
            body.putObject("tool_choice").put("type", "auto");
        } else {
            tools.forEach(array::add);
            body.put("tool_choice", "auto");
        }
    }

    private ModelHttp.Reply send(String url, Map<String, String> headers, ObjectNode body, Duration timeout) {
        try {
            return http.send("POST", url, headers, write(body), timeout);
        } catch (IOException unreachable) {
            throw new ModelProviderException("AI provider unreachable: " + reason(unreachable), unreachable);
        }
    }

    private Optional<List<String>> models(String url, Map<String, String> headers) {
        try {
            ModelHttp.Reply reply = http.send("GET", url, headers, null, PROBE_TIMEOUT);
            if (!reply.ok()) {
                return Optional.empty();
            }
            JsonNode data = read(reply.body()).path("data");
            List<String> ids = new ArrayList<>();
            data.forEach(row -> {
                String id = row.path("id").asText("");
                if (!id.isEmpty()) {
                    ids.add(id);
                }
            });
            return Optional.of(List.copyOf(ids));
        } catch (IOException | RuntimeException unavailable) {
            return Optional.empty();
        }
    }

    private static Map<String, String> openAiHeaders(String apiKey) {
        Map<String, String> headers = baseHeaders();
        if (!apiKey.isEmpty()) {
            headers.put("Authorization", "Bearer " + apiKey);
        }
        return headers;
    }

    private static Map<String, String> anthropicHeaders(String apiKey) {
        Map<String, String> headers = baseHeaders();
        headers.put("anthropic-version", AnthropicProtocol.VERSION);
        if (!apiKey.isEmpty()) {
            headers.put("x-api-key", apiKey);
        }
        return headers;
    }

    private static Map<String, String> baseHeaders() {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("Accept", "application/json");
        headers.put("User-Agent", USER_AGENT);
        return headers;
    }

    private static LlmUsage usage(JsonNode usage) {
        return new LlmUsage(usage.path("prompt_tokens").asLong(0), usage.path("completion_tokens").asLong(0),
            usage.path("total_tokens").asLong(0));
    }

    private String write(JsonNode body) {
        try {
            return mapper.writeValueAsString(body);
        } catch (JsonProcessingException impossible) {
            throw new ModelProviderException("Invalid AI request", impossible);
        }
    }

    private JsonNode read(String body) {
        try {
            JsonNode node = mapper.readTree(body == null ? "" : body);
            if (node == null || node.isMissingNode()) {
                throw new ModelProviderException("AI provider sent an empty answer");
            }
            return node;
        } catch (JsonProcessingException invalid) {
            throw new ModelProviderException("AI provider sent an invalid answer");
        }
    }

    /** Le message d'erreur d'Anthropic ({@code {error: {type, message}}}), borné ; jamais le corps entier. */
    private String errorMessage(String body) {
        try {
            JsonNode error = mapper.readTree(body == null ? "" : body).path("error");
            String message = error.path("type").asText("") + ": " + error.path("message").asText("");
            message = message.replaceAll("\\R", " ");
            return message.length() > 300 ? message.substring(0, 300) + "..." : message;
        } catch (JsonProcessingException | RuntimeException unreadable) {
            return "";
        }
    }

    /** La raison d'une panne de transport, sans adresse ni en-tête. */
    private static String reason(IOException failure) {
        String message = failure.getMessage();
        return failure.getClass().getSimpleName() + (message == null || message.isBlank() ? "" : " (" + message + ")");
    }
}
