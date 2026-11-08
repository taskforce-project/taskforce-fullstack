package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

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
 *       ({@code think: false}), qu'Ollama 0.40 suit quand il ignore la directive (même appel d'outil : 2,9 s puis 0,5 s,
 *       mesuré le 29/10/2026) ;</li>
 *   <li>avec Ollama, la conversation passe par son API ({@code /api/chat}), la seule où une requête choisit sa fenêtre
 *       de contexte : elle est taillée à chaque requête ({@link OllamaProtocol}), au lieu des 4 096 jetons par défaut
 *       où le prompt de Cortex perdait son début (J1-4, 04/11/2026) ;</li>
 *   <li>la fenêtre des autres fournisseurs vient de leur liste de modèles, quand ils la disent ; sinon la valeur prudente
 *       des réglages, marquée comme une estimation ({@link #window}) ;</li>
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
    /** Délai de la liste des modèles chargés par Ollama, lue avant chaque conversation : elle répond en une milliseconde. */
    static final Duration LOADED_TIMEOUT = Duration.ofSeconds(1);
    private static final double TEMPERATURE = 0.4;

    private final ObjectMapper mapper;
    private final ModelHttp http;
    /** La fiche de chaque modèle d'Ollama ({@code /api/show}), par adresse : elle ne change qu'avec le modèle. */
    private final Map<String, ModelCard> modelCards = new ConcurrentHashMap<>();
    /** La fenêtre que chaque fournisseur hébergé dit de ses modèles, par adresse, relue avec sa liste (état de l'IA, 30 s). */
    private final Map<String, Integer> reportedWindows = new ConcurrentHashMap<>();

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

    /**
     * La réponse : le modèle qui a répondu, le message assistant (qui peut porter des {@code tool_calls}), l'usage, et la
     * fenêtre de contexte de cette requête : celle que la passerelle a donnée à Ollama ({@code num_ctx}), celle qu'un
     * autre fournisseur dit de ce modèle, ou la valeur prudente des réglages ({@code windowEstimated}).
     */
    public record ChatReply(String model, ObjectNode message, LlmUsage usage, Integer contextWindow, boolean windowEstimated) {

        /** Une réponse dont personne ne dit la fenêtre. */
        public ChatReply(String model, ObjectNode message, LlmUsage usage) {
            this(model, message, usage, null, false);
        }

        /** Une réponse dont on connaît la fenêtre. */
        public ChatReply(String model, ObjectNode message, LlmUsage usage, Integer contextWindow) {
            this(model, message, usage, contextWindow, false);
        }
    }

    /**
     * Ce que la fiche d'un modèle dit de lui chez son fournisseur, telle qu'Ollama la donne : sa taille (« 8.2B »), sa
     * fenêtre de contexte en jetons, et s'il prend des outils ; chaque valeur est {@code null} quand la fiche ne la dit
     * pas. Ce n'est pas une mesure : la table des capacités la montre comme telle tant que le modèle n'est pas mesuré ici
     * (R113, R125).
     */
    public record ModelCard(String parameters, Integer contextLength, Boolean tools) {

        static final ModelCard NONE = new ModelCard(null, null, null);

        boolean empty() {
            return parameters == null && contextLength == null && tools == null;
        }
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
        return switch (settings.provider()) {
            case ANTHROPIC -> anthropic(settings, call, tools);
            case OLLAMA -> ollama(settings, call, tools);
            case OPENAI -> openAi(settings, call, tools);
        };
    }

    /**
     * La fenêtre sur laquelle TaskForce compte pour une requête de ce modèle (TF-J1-13). Sur Ollama, ce que la passerelle
     * lui donne au plus. Ailleurs, ce que le fournisseur dit dans sa liste de modèles, sous {@code AI_HOSTED_MAX_CONTEXT} ;
     * s'il ne dit rien, {@code AI_DEFAULT_CONTEXT}, marquée comme une estimation. Chez Anthropic, la réponse a la place que
     * lui donne {@code AI_MAX_TOKENS} : au-delà de la fenêtre, elle s'arrêterait en route (ses modèles récents), ou l'API
     * refuserait la requête (les plus anciens).
     */
    public ModelWindow window(AiProviderSettings settings, String model, boolean think) {
        if (settings.provider() == AiProvider.OLLAMA) {
            String base = OllamaProtocol.nativeBase(settings.baseUrl());
            int maximum = model == null || model.isBlank() ? 0 : modelMaximum(base, openAiHeaders(settings.apiKey()), model);
            int ceiling = OllamaProtocol.ceiling(settings.ollamaMaxContext(), maximum);
            return new ModelWindow(model, ceiling, false, ContextBudget.answerRoom(ceiling, think));
        }
        Integer reported = reportedWindow(settings, model);
        int known = reported == null ? settings.defaultContext() : reported;
        int tokens = settings.hostedMaxContext() > 0 ? Math.min(known, settings.hostedMaxContext()) : known;
        int room = settings.provider() == AiProvider.ANTHROPIC
            ? Math.min(settings.maxTokens(), tokens / 2) : ContextBudget.answerRoom(tokens, think);
        return new ModelWindow(model, tokens, reported == null, room);
    }

    /** Ce que le fournisseur dit de la fenêtre de ce modèle, relu à chaque liste de ses modèles ; null s'il ne dit rien. */
    private Integer reportedWindow(AiProviderSettings settings, String model) {
        return model == null ? null : reportedWindows.get(settings.baseUrl() + " " + model);
    }

    /**
     * La plus grande fenêtre de contexte que la passerelle donne à ce modèle, en jetons, pour l'état de l'IA : sur
     * Ollama, {@code AI_OLLAMA_MAX_CONTEXT}, ou le maximum du modèle s'il est plus petit. Ailleurs, le fournisseur la
     * tient : vide (la conversation lit {@link #window}).
     */
    public Optional<Integer> contextWindow(AiProviderSettings settings, String model) {
        if (!settings.enabled() || settings.provider() != AiProvider.OLLAMA || model == null || model.isBlank()) {
            return Optional.empty();
        }
        String base = OllamaProtocol.nativeBase(settings.baseUrl());
        int maximum = modelMaximum(base, openAiHeaders(settings.apiKey()), model);
        return Optional.of(OllamaProtocol.ceiling(settings.ollamaMaxContext(), maximum));
    }

    /**
     * Ce que la fiche d'un modèle dit de lui (sa taille, sa fenêtre, ses outils), pour la table des capacités tant qu'il
     * n'est pas mesuré (R125) : sur Ollama, lue une fois dans {@code /api/show} ; chez un autre fournisseur, la fenêtre
     * qu'il dit dans sa liste de modèles. Sans rien de lisible : vide.
     */
    public Optional<ModelCard> describe(AiProviderSettings settings, String model) {
        if (!settings.enabled() || model == null || model.isBlank()) {
            return Optional.empty();
        }
        if (settings.provider() != AiProvider.OLLAMA) {
            Integer reported = reportedWindow(settings, model);
            return reported == null ? Optional.empty() : Optional.of(new ModelCard(null, reported, null));
        }
        ModelCard card = card(OllamaProtocol.nativeBase(settings.baseUrl()), openAiHeaders(settings.apiKey()), model);
        return card.empty() ? Optional.empty() : Optional.of(card);
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
            return models(settings.baseUrl() + "/models?limit=1000", anthropicHeaders(settings.apiKey()), settings.baseUrl());
        }
        // La liste d'Ollama (/v1/models) ne dit pas de fenêtre : la sienne vient de sa fiche.
        return models(settings.baseUrl() + "/models", openAiHeaders(settings.apiKey()),
            settings.provider() == AiProvider.OLLAMA ? null : settings.baseUrl());
    }

    /** Les modèles que le fournisseur des vecteurs annonce ; vide s'il ne répond pas. */
    public Optional<List<String>> embedModels(AiProviderSettings settings) {
        return models(settings.embedBaseUrl() + "/models", openAiHeaders(settings.embedApiKey()), null);
    }

    // -------------------------------------------------------------------------
    // API compatible OpenAI
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
        String url = settings.baseUrl() + "/chat/completions";
        Map<String, String> headers = openAiHeaders(settings.apiKey());
        List<JsonNode> attempt = tools;
        boolean retriedGeneration = false;
        while (true) {
            withTools(body, attempt, AiProvider.OPENAI);
            ModelHttp.Reply reply = send(url, headers, body, settings.timeout());
            if (reply.ok()) {
                JsonNode payload = read(reply.body());
                JsonNode choices = payload.path("choices");
                if (!choices.isArray() || choices.isEmpty() || !(choices.get(0).path("message") instanceof ObjectNode message)) {
                    throw new ModelProviderException("AI provider answered without choices");
                }
                ModelWindow window = window(settings, model, call.think());
                return new ChatReply(model, OpenAiProtocol.stripThinking(message), usage(payload.path("usage")),
                    window.tokens(), window.estimated());
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
    // API d'Ollama
    // -------------------------------------------------------------------------

    /**
     * Une conversation par l'API d'Ollama, avec la fenêtre de contexte que demande la requête : ses messages et ses
     * outils estimés, plus la place de la réponse, au plus le plafond des réglages et le maximum du modèle. Elle se
     * taille sur le premier essai : avec moins d'outils, les suivants y tiennent, sans recharger le modèle.
     */
    private ChatReply ollama(AiProviderSettings settings, ChatCall call, List<JsonNode> tools) {
        String model = call.model();
        String base = OllamaProtocol.nativeBase(settings.baseUrl());
        Map<String, String> headers = openAiHeaders(settings.apiKey());
        ObjectNode body = OllamaProtocol.request(mapper, call.messages(), model, call.think(), call.jsonMode(), TEMPERATURE);
        List<JsonNode> attempt = tools;
        withTools(body, attempt, AiProvider.OLLAMA);
        int window = sizeWindow(settings, base, headers, call, body);
        ((ObjectNode) body.path("options")).put("num_ctx", window);
        while (true) {
            ModelHttp.Reply reply = send(base + "/api/chat", headers, body, settings.timeout());
            if (reply.ok()) {
                JsonNode payload = read(reply.body());
                ObjectNode message = OllamaProtocol.message(mapper, payload);
                return new ChatReply(model, OpenAiProtocol.stripThinking(message), OllamaProtocol.usage(payload), window);
            }
            if ((reply.status() == 400 || reply.status() == 413) && !attempt.isEmpty()) {
                attempt = fewerTools(reply.status(), attempt);
                withTools(body, attempt, AiProvider.OLLAMA);
                continue;
            }
            throw new ModelProviderException("AI provider refused the request (HTTP " + reply.status() + ")");
        }
    }

    /** La fenêtre de la requête (cf. {@link OllamaProtocol#window}) ; une requête qui la dépasse est signalée au journal. */
    private int sizeWindow(AiProviderSettings settings, String base, Map<String, String> headers, ChatCall call,
                           ObjectNode body) {
        String model = call.model();
        int ceiling = OllamaProtocol.ceiling(settings.ollamaMaxContext(), modelMaximum(base, headers, model));
        int loaded = loadedWindow(base, headers, model);
        int tokens = ContextBudget.tokens(write(body.path("messages")))
            + (body.has("tools") ? ContextBudget.tokens(write(body.path("tools"))) : 0);
        int needed = OllamaProtocol.needed(tokens, call.think(), ceiling);
        int window = OllamaProtocol.window(needed, ceiling, loaded);
        if (needed > window) {
            log.warn("A request to {} needs about {} tokens, more than its context window of {}: Ollama drops the "
                + "oldest messages, then the start (AI_OLLAMA_MAX_CONTEXT raises the window)", LogSafe.of(model), needed, window);
        } else {
            log.debug("Ollama {}: about {} tokens, context window {} (ceiling {}, loaded {})", LogSafe.of(model), tokens,
                window, ceiling, loaded);
        }
        return window;
    }

    /** Le maximum d'un modèle d'Ollama, lu une fois ; 0 s'il n'est pas lisible (le plafond des réglages vaut seul). */
    private int modelMaximum(String base, Map<String, String> headers, String model) {
        Integer maximum = card(base, headers, model).contextLength();
        return maximum == null ? 0 : maximum;
    }

    /**
     * La fiche d'un modèle d'Ollama ({@code /api/show}), lue une fois et gardée quand elle dit quelque chose ; vide si
     * elle n'est pas lisible, et relue la fois suivante.
     */
    private ModelCard card(String base, Map<String, String> headers, String model) {
        String key = base + " " + model;
        ModelCard known = modelCards.get(key);
        if (known != null) {
            return known;
        }
        try {
            ModelHttp.Reply reply = http.send("POST", base + "/api/show", headers,
                write(mapper.createObjectNode().put("model", model)), PROBE_TIMEOUT);
            ModelCard card = reply.ok() ? OllamaProtocol.card(read(reply.body())) : ModelCard.NONE;
            if (!card.empty()) {
                modelCards.put(key, card);
            }
            return card;
        } catch (IOException | RuntimeException unreadable) {
            return ModelCard.NONE;
        }
    }

    /** La fenêtre avec laquelle Ollama garde ce modèle chargé ; 0 s'il ne l'est pas, ou si Ollama ne le dit pas. */
    private int loadedWindow(String base, Map<String, String> headers, String model) {
        try {
            ModelHttp.Reply reply = http.send("GET", base + "/api/ps", headers, null, LOADED_TIMEOUT);
            return reply.ok() ? OllamaProtocol.loadedWindow(read(reply.body()), model) : 0;
        } catch (IOException | RuntimeException unknown) {
            return 0;
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
            withTools(body, attempt, AiProvider.ANTHROPIC);
            ModelHttp.Reply reply = send(url, headers, body, settings.timeout());
            if (reply.ok()) {
                JsonNode payload = read(reply.body());
                ModelWindow window = window(settings, call.model(), call.think());
                return new ChatReply(call.model(), AnthropicProtocol.message(mapper, payload, call.jsonMode()),
                    usage(AnthropicProtocol.usage(mapper, payload)), window.tokens(), window.estimated());
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

    /** Les outils au format du fournisseur ; l'API d'Ollama n'a pas de {@code tool_choice}, le modèle choisit toujours. */
    private void withTools(ObjectNode body, List<JsonNode> tools, AiProvider format) {
        if (tools.isEmpty()) {
            body.remove("tools");
            body.remove("tool_choice");
            return;
        }
        ArrayNode array = body.putArray("tools");
        switch (format) {
            case ANTHROPIC -> {
                tools.forEach(tool -> array.add(AnthropicProtocol.tool(mapper, tool)));
                body.putObject("tool_choice").put("type", "auto");
            }
            case OPENAI -> {
                tools.forEach(array::add);
                body.put("tool_choice", "auto");
            }
            case OLLAMA -> tools.forEach(array::add);
        }
    }

    private ModelHttp.Reply send(String url, Map<String, String> headers, ObjectNode body, Duration timeout) {
        try {
            return http.send("POST", url, headers, write(body), timeout);
        } catch (IOException unreachable) {
            throw new ModelProviderException("AI provider unreachable: " + reason(unreachable), unreachable);
        }
    }

    /**
     * Les modèles d'une liste, en gardant la fenêtre de ceux qui la disent, quand {@code windowsOf} nomme l'adresse où
     * les retrouver (les vecteurs n'en ont pas besoin).
     */
    private Optional<List<String>> models(String url, Map<String, String> headers, String windowsOf) {
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
                    int reported = OpenAiProtocol.reportedWindow(row);
                    if (windowsOf != null && reported > 0) {
                        reportedWindows.put(windowsOf + " " + id, reported);
                    }
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
