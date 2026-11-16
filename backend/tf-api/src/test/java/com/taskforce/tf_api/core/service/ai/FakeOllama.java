package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Un Ollama factice sur 127.0.0.1, qui répond comme Ollama 0.40.16 sur le poste du CEO le 16/11/2026 : la liste des modèles
 * ({@code /v1/models}), leurs fiches ({@code /api/show}), leur place sur le disque ({@code /api/tags}), les modèles chargés
 * ({@code /api/ps}) et la conversation ({@code /api/chat}). Un modèle se charge à la première conversation, et de nouveau quand la
 * fenêtre change ; une conversation sans message ne fait que le charger. Un modèle qui raisonne rend son raisonnement à part
 * ({@code thinking}), à côté de sa réponse, tant que la requête ne dit pas {@code think: false}. Il garde chaque conversation
 * reçue, pour que l'essai la vérifie.
 */
public final class FakeOllama implements AutoCloseable {

    public static final String MIMO = "mimo-v2.6:9b";
    public static final String QWEN35 = "qwen3.5:9b";

    /**
     * La fiche de mimo-v2.6:9b telle qu'Ollama 0.40.16 la rend (16/11/2026), réduite à ce que la passerelle lit : un Qwen3.5
     * sous un autre nom, que seules sa famille et son analyseur disent.
     */
    public static final String MIMO_SHOW = """
        {"details":{"parent_model":"model-q4_K_M.gguf","format":"gguf","family":"qwen35","families":["qwen35"],
        "parameter_size":"9.0B","quantization_level":"Q4_K_M","runner":"llamacpp"},
        "capabilities":["completion","vision","tools","thinking"],"parser":"qwen3.5","renderer":"mimo-v2.6",
        "template":"{{ .Prompt }}","model_info":{"general.architecture":"qwen35","general.basename":"MiMo-V2.6-Distill-Qwen",
        "qwen35.context_length":262144}}""";

    /** La fiche de qwen3.5:9b, le même jour. */
    public static final String QWEN35_SHOW = """
        {"details":{"parent_model":"","format":"gguf","family":"qwen35","families":["qwen35"],"parameter_size":"9.7B",
        "quantization_level":"Q4_K_M"},"capabilities":["completion","vision","tools","thinking"],"parser":"qwen3.5",
        "renderer":"qwen3.5","template":"{{ .Prompt }}","model_info":{"general.architecture":"qwen35",
        "qwen35.context_length":262144}}""";

    /** Une conversation reçue, telle qu'Ollama l'a lue. */
    public record Chat(JsonNode body) {

        /** Sans message : la conversation qui charge le modèle. */
        public boolean load() {
            return body.path("messages").isEmpty();
        }
    }

    /** Un modèle installé : sa fiche, sa place sur le disque. */
    private record Installed(String show, long size) {
    }

    private final ObjectMapper json = new ObjectMapper();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final HttpServer server;
    private final Map<String, Installed> installed = new ConcurrentHashMap<>();
    /** L'ordre de la liste d'Ollama : le dernier installé d'abord. */
    private final List<String> order = new CopyOnWriteArrayList<>();
    /** Les modèles chargés, avec leur fenêtre. */
    private final Map<String, Integer> loaded = new ConcurrentHashMap<>();
    private final List<Chat> chats = new CopyOnWriteArrayList<>();
    private final CountDownLatch asked = new CountDownLatch(1);
    private final CountDownLatch release = new CountDownLatch(1);

    private volatile long loadMillis;
    private volatile String answer = "ok";
    private volatile String thinking = "Let me think about it first.";
    private volatile int refusal;
    private volatile String refusalBody = "";
    private volatile boolean holding;

    public FakeOllama() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        server.createContext("/", this::route);
        server.start();
    }

    /** L'adresse d'Ollama, sans {@code /v1}. */
    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Installe un modèle, avec sa fiche ({@code null} : un modèle de vecteurs, dont la passerelle ne lit pas la fiche). */
    public FakeOllama install(String name, String show, long size) {
        installed.put(name, new Installed(show, size));
        order.add(0, name);
        return this;
    }

    /** Le temps que prend un chargement : celui de mimo-v2.6:9b à froid était de 4,03 s. */
    public FakeOllama loadsIn(long millis) {
        loadMillis = millis;
        return this;
    }

    /** Ce que le modèle répond, et ce qu'il raisonne avant quand on le laisse faire. */
    public FakeOllama answers(String content, String reasoning) {
        answer = content;
        thinking = reasoning;
        return this;
    }

    /** Ollama refuse chaque question (pas les chargements), avec ce statut et ce corps. */
    public FakeOllama refuses(int status, String body) {
        refusal = status;
        refusalBody = body;
        return this;
    }

    /** Le modèle calcule longtemps : chaque question attend qu'on ferme Ollama. */
    public FakeOllama holds() {
        holding = true;
        return this;
    }

    /** Attend qu'une question (pas un chargement) arrive. */
    public boolean awaitQuestion(long seconds) throws InterruptedException {
        return asked.await(seconds, TimeUnit.SECONDS);
    }

    /** Les conversations reçues, chargements compris, dans l'ordre. */
    public List<Chat> chats() {
        return List.copyOf(chats);
    }

    /** Les questions reçues, sans les chargements. */
    public List<Chat> questions() {
        return chats.stream().filter(chat -> !chat.load()).toList();
    }

    @Override
    public void close() {
        release.countDown();
        server.stop(0);
        executor.shutdownNow();
    }

    private void route(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            byte[] raw = exchange.getRequestBody().readAllBytes();
            switch (exchange.getRequestMethod() + " " + path) {
                case "GET /v1/models" -> send(exchange, 200, models());
                case "GET /api/tags" -> send(exchange, 200, tags());
                case "GET /api/ps" -> send(exchange, 200, ps());
                case "POST /api/show" -> show(exchange, json.readTree(raw));
                case "POST /api/chat" -> chat(exchange, json.readTree(raw));
                default -> send(exchange, 404, "404 page not found");
            }
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
        } finally {
            exchange.close();
        }
    }

    private String models() {
        ObjectNode list = json.createObjectNode().put("object", "list");
        ArrayNode data = list.putArray("data");
        order.forEach(name -> data.addObject().put("id", name).put("object", "model").put("created", 1_763_316_140L)
            .put("owned_by", "library"));
        return list.toString();
    }

    private String tags() {
        ObjectNode tags = json.createObjectNode();
        ArrayNode models = tags.putArray("models");
        order.forEach(name -> models.addObject().put("name", name).put("model", name).put("size", installed.get(name).size()));
        return tags.toString();
    }

    private String ps() {
        ObjectNode ps = json.createObjectNode();
        ArrayNode models = ps.putArray("models");
        loaded.forEach((name, window) -> models.addObject().put("name", name).put("model", name)
            .put("size", 7_200_000_000L).put("size_vram", 6_400_000_000L).put("context_length", window));
        return ps.toString();
    }

    private void show(HttpExchange exchange, JsonNode body) throws IOException {
        Installed model = installed.get(body.path("model").asText(""));
        if (model == null || model.show() == null) {
            send(exchange, 404, "{\"error\":\"model '" + body.path("model").asText("") + "' not found\"}");
            return;
        }
        send(exchange, 200, model.show());
    }

    private void chat(HttpExchange exchange, JsonNode body) throws IOException, InterruptedException {
        chats.add(new Chat(body));
        String model = body.path("model").asText("");
        if (!installed.containsKey(model)) {
            send(exchange, 404, "{\"error\":\"model '" + model + "' not found\"}");
            return;
        }
        int window = body.path("options").path("num_ctx").asInt(4_096);
        if (!Integer.valueOf(window).equals(loaded.get(model))) {
            // Ollama recharge le modèle à chaque changement de fenêtre.
            Thread.sleep(loadMillis);
            loaded.put(model, window);
        }
        ObjectNode reply = json.createObjectNode().put("model", model).put("created_at", "2026-11-16T18:28:18.6971234Z");
        ObjectNode message = reply.putObject("message").put("role", "assistant");
        if (body.path("messages").isEmpty()) {
            message.put("content", "");
            reply.put("done_reason", "load").put("done", true);
            send(exchange, 200, reply.toString());
            return;
        }
        asked.countDown();
        if (holding) release.await(60, TimeUnit.SECONDS);
        if (refusal > 0) {
            send(exchange, refusal, refusalBody);
            return;
        }
        message.put("content", answer);
        // Un modèle qui raisonne le fait tant que la requête ne le lui interdit pas.
        if (!body.path("think").isBoolean() || body.path("think").asBoolean()) message.put("thinking", thinking);
        reply.put("done_reason", "stop").put("done", true).put("prompt_eval_count", 412).put("eval_count", 96);
        send(exchange, 200, reply.toString());
    }

    private static void send(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", status == 404 && !body.startsWith("{") ? "text/plain" : "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
