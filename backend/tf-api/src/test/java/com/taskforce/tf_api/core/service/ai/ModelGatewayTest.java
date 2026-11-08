package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.net.ConnectException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.service.LlmUsage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * La passerelle de modèles devant un fournisseur rejoué : les comportements de l'ai-service Python et du relais de la
 * coque (cas repris de ai-service/tests/test_provider.py et desktop/test/ai.test.ts), et l'API d'Anthropic.
 */
@DisplayName("ModelGateway")
class ModelGatewayTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CHOICE = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}],"
        + "\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":1,\"total_tokens\":4}}";
    /** La même réponse par l'API d'Ollama. */
    private static final String NATIVE = "{\"model\":\"qwen3:8b\",\"message\":{\"role\":\"assistant\",\"content\":\"ok\"},"
        + "\"done\":true,\"prompt_eval_count\":3,\"eval_count\":1}";
    /** Les deux API de la conversation hors Anthropic : celle d'Ollama (rien de posé), et une API compatible OpenAI. */
    private static final Map<String, String> OLLAMA = Map.of();
    private static final Map<String, String> COMPATIBLE = Map.of("AI_BASE_URL", "https://api.example.com/v1");
    private static final String QWEN3_SHOW = "{\"model_info\":{\"general.architecture\":\"qwen3\",\"qwen3.context_length\":40960}}";

    /**
     * Fournisseur rejoué : les réponses dans l'ordre, les requêtes gardées. Les lectures d'Ollama ({@code /api/show},
     * {@code /api/ps}) ont leurs réponses fixes (404 sans réponse posée), et sont gardées à part : ce ne sont pas des
     * conversations.
     */
    static final class FakeHttp implements ModelHttp {
        record Sent(String method, String url, Map<String, String> headers, JsonNode body, Duration timeout) {
        }

        private static final List<String> READS = List.of("/api/show", "/api/ps");

        final List<Sent> sent = new ArrayList<>();
        final List<Sent> reads = new ArrayList<>();
        final Map<String, Reply> fixed = new HashMap<>();
        final Deque<Object> replies = new ArrayDeque<>();

        FakeHttp reply(int status, String body) {
            replies.add(new Reply(status, body));
            return this;
        }

        FakeHttp fail(IOException failure) {
            replies.add(failure);
            return this;
        }

        /** La réponse fixe d'une lecture d'Ollama, {@code /api/show} ou {@code /api/ps}. */
        FakeHttp read(String path, String body) {
            fixed.put(path, new Reply(200, body));
            return this;
        }

        @Override
        public Reply send(String method, String url, Map<String, String> headers, String body, Duration timeout)
            throws IOException {
            Sent request = new Sent(method, url, headers, body == null ? null : JSON.readTree(body), timeout);
            for (String path : READS) {
                if (url.endsWith(path)) {
                    reads.add(request);
                    return fixed.getOrDefault(path, new Reply(404, "{}"));
                }
            }
            sent.add(request);
            Object next = replies.size() > 1 ? replies.poll() : replies.peek();
            if (next == null) {
                throw new ConnectException("nothing listens");
            }
            if (next instanceof IOException failure) {
                throw failure;
            }
            return (Reply) next;
        }

        List<Integer> toolCounts() {
            return sent.stream().map(s -> s.body().path("tools").size()).toList();
        }
    }

    private FakeHttp http;
    private ModelGateway gateway;

    @BeforeEach
    void setUp() {
        http = new FakeHttp();
        gateway = new ModelGateway(JSON, http);
    }

    private static AiProviderSettings settings(Map<String, String> env) {
        return AiProviderSettings.from(env::get);
    }

    private static List<Map<String, Object>> tools(int count) {
        return IntStream.range(0, count)
            .mapToObj(i -> Map.<String, Object>of("type", "function", "function", Map.of("name", "t" + i,
                "description", "tool " + i, "parameters", Map.of("type", "object", "properties", Map.of()))))
            .toList();
    }

    private static List<Map<String, Object>> question() {
        return List.of(Map.of("role", "system", "content", "s"), Map.of("role", "user", "content", "hi"));
    }

    private ModelGateway.ChatReply chat(Map<String, String> env, String model, boolean think, int toolCount) {
        return gateway.chat(settings(env), new ModelGateway.ChatCall(question(), tools(toolCount), false, model, think));
    }

    /** Une réponse réussie, au format de l'API des réglages. */
    private static String ok(Map<String, String> env) {
        return settings(env).provider() == AiProvider.OLLAMA ? NATIVE : CHOICE;
    }

    @Nested
    @DisplayName("API compatible OpenAI")
    class OpenAi {

        static Stream<Arguments> reasoning() {
            return Stream.of(
                // Hors d'Ollama, la directive seule : le réglage natif d'Ollama n'y est pas garanti.
                Arguments.of(Map.of("GROQ_API_KEY", "gsk"), "qwen/qwen3-32b", false, "hi /no_think"),
                Arguments.of(COMPATIBLE, "qwen3:8b", false, "hi /no_think"),
                Arguments.of(COMPATIBLE, "qwen3:8b", true, "hi"),
                Arguments.of(Map.of("GROQ_API_KEY", "gsk"), "openai/gpt-oss-20b", false, "hi"));
        }

        @ParameterizedTest(name = "{1}, raisonnement {2}")
        @MethodSource("reasoning")
        @DisplayName("Qwen3 ne raisonne que quand on le lui demande ; ni fenêtre ni lecture d'Ollama")
        void reasoning(Map<String, String> env, String model, boolean think, String lastMessage) {
            http.reply(200, CHOICE);

            ModelGateway.ChatReply reply = chat(env, model, think, 0);

            JsonNode body = http.sent.get(0).body();
            assertThat(http.sent.get(0).url()).endsWith("/chat/completions");
            assertThat(body.path("model").asText()).isEqualTo(model);
            assertThat(body.path("messages").get(1).path("content").asText()).isEqualTo(lastMessage);
            assertThat(body.has("reasoning_effort")).isFalse();
            assertThat(body.has("options")).isFalse();
            assertThat(http.reads).isEmpty();
            assertThat(reply.model()).isEqualTo(model);
            assertThat(reply.message().path("content").asText()).isEqualTo("ok");
            assertThat(reply.usage().totalTokens()).isEqualTo(4);
            assertThat(reply.contextWindow()).isNull(); // le fournisseur tient sa fenêtre
        }

        @Test
        @DisplayName("clé, User-Agent, mode JSON et adresse du fournisseur")
        void headersAndJsonMode() {
            http.reply(200, CHOICE);

            gateway.chat(settings(Map.of("GROQ_API_KEY", "gsk")),
                new ModelGateway.ChatCall(question(), null, true, "openai/gpt-oss-20b", false));

            FakeHttp.Sent request = http.sent.get(0);
            assertThat(request.url()).isEqualTo("https://api.groq.com/openai/v1/chat/completions");
            assertThat(request.headers()).containsEntry("Authorization", "Bearer gsk")
                .containsEntry("User-Agent", "TaskForce-AI/1.0");
            assertThat(request.body().path("response_format").path("type").asText()).isEqualTo("json_object");
            assertThat(request.body().path("temperature").asDouble()).isEqualTo(0.4);
            assertThat(request.body().has("tools")).isFalse();
            assertThat(request.timeout()).isEqualTo(Duration.ofSeconds(120));
        }

        private static final String FAILED_CALL =
            "{\"error\":{\"message\":\"Tool call validation failed\",\"type\":\"invalid_request_error\",\"code\":\"tool_use_failed\"}}";

        @Test
        @DisplayName("un appel d'outil mal formé se redemande tel quel, une fois")
        void malformedToolCallIsAskedAgain() {
            http.reply(400, FAILED_CALL).reply(200, CHOICE);

            chat(Map.of("GROQ_API_KEY", "gsk"), "openai/gpt-oss-20b", false, 7);

            assertThat(http.toolCounts()).containsExactly(7, 7);
        }

        @Test
        @DisplayName("mal formé deux fois : alors moins d'outils")
        void malformedTwiceThenFewerTools() {
            http.reply(400, FAILED_CALL).reply(400, FAILED_CALL).reply(200, CHOICE);

            chat(Map.of("GROQ_API_KEY", "gsk"), "openai/gpt-oss-20b", false, 7);

            assertThat(http.toolCounts()).containsExactly(7, 7, 3);
        }

        @Test
        @DisplayName("réponse sans choix")
        void noChoices() {
            http.reply(200, "{\"choices\":[]}");

            assertThatThrownBy(() -> chat(COMPATIBLE, "qwen3:8b", false, 0))
                .isInstanceOf(ModelProviderException.class).hasMessageContaining("without choices");
        }
    }

    @Nested
    @DisplayName("Ollama et API compatible OpenAI : ce qu'elles font pareil")
    class BothApis {

        static Stream<Arguments> apis() {
            return Stream.of(Arguments.of("Ollama", OLLAMA), Arguments.of("compatible OpenAI", COMPATIBLE));
        }

        static Stream<Arguments> refusals() {
            return apis().flatMap(api -> Stream.of(400, 413).map(status -> Arguments.of(api.get()[0], api.get()[1], status)));
        }

        static Stream<Arguments> otherRefusals() {
            return apis().flatMap(api -> Stream.of(401, 404, 429, 500)
                .map(status -> Arguments.of(api.get()[0], api.get()[1], status)));
        }

        @ParameterizedTest(name = "{0}, HTTP {2}")
        @MethodSource("refusals")
        @DisplayName("trop d'outils : on redemande avec moitié moins")
        void halvesTheTools(String api, Map<String, String> env, int status) {
            http.reply(status, "{}").reply(status, "{}").reply(200, ok(env));

            chat(env, "qwen3:8b", false, 8);

            assertThat(http.toolCounts()).containsExactly(8, 4, 2);
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("apis")
        @DisplayName("jamais sans les outils : refusés jusqu'au dernier, on le dit")
        void neverWithoutTools(String api, Map<String, String> env) {
            http.reply(400, "{}");

            assertThatThrownBy(() -> chat(env, "qwen3:8b", false, 8))
                .isInstanceOf(ModelProviderException.ToolsRefused.class)
                .hasMessage("AI provider refused the tools (HTTP 400)");
            assertThat(http.toolCounts()).containsExactly(8, 4, 2, 1);
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("apis")
        @DisplayName("trop gros même avec un seul outil : la conversation, pas les outils")
        void tooLargeIsNotAToolRefusal(String api, Map<String, String> env) {
            http.reply(413, "{}");

            assertThatThrownBy(() -> chat(env, "qwen3:8b", false, 4))
                .isInstanceOf(ModelProviderException.class)
                .isNotInstanceOf(ModelProviderException.ToolsRefused.class)
                .hasMessageContaining("too large");
        }

        @ParameterizedTest(name = "{0}, HTTP {2}")
        @MethodSource("otherRefusals")
        @DisplayName("refus du fournisseur, sans outils à réduire")
        void providerRefusal(String api, Map<String, String> env, int status) {
            http.reply(status, "{}");

            assertThatThrownBy(() -> chat(env, "qwen3:8b", false, 0))
                .isInstanceOf(ModelProviderException.class)
                .hasMessage("AI provider refused the request (HTTP " + status + ")");
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("apis")
        @DisplayName("fournisseur injoignable")
        void unreachable(String api, Map<String, String> env) {
            http.fail(new ConnectException("refused"));

            assertThatThrownBy(() -> chat(env, "qwen3:8b", false, 0))
                .isInstanceOf(ModelProviderException.class).hasMessageContaining("unreachable");
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("apis")
        @DisplayName("retire un bloc de raisonnement resté dans la réponse")
        void stripsThinking(String api, Map<String, String> env) {
            String content = "<think>x</think>\\n{\\\"a\\\":1}";
            http.reply(200, env.isEmpty()
                ? "{\"message\":{\"role\":\"assistant\",\"content\":\"" + content + "\"}}"
                : "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"" + content + "\"}}]}");

            assertThat(chat(env, "qwen3:8b", true, 0).message().path("content").asText()).isEqualTo("{\"a\":1}");
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("apis")
        @DisplayName("ni clé quand il n'y en a pas, ni contenu propre à Anthropic")
        void noKeyNoForeignContent(String api, Map<String, String> env) {
            http.reply(200, ok(env));
            List<Map<String, Object>> messages = List.of(Map.of("role", "user", "content", "q"),
                Map.of("role", "assistant", "content", "", "_anthropic_content", List.of(Map.of("type", "thinking"))),
                Map.of("role", "tool", "tool_call_id", "c1", "content", "r"));

            gateway.chat(settings(env), new ModelGateway.ChatCall(messages, List.of(), false, "llama3.1:8b", false));

            assertThat(http.sent.get(0).headers()).doesNotContainKey("Authorization");
            assertThat(http.sent.get(0).body().path("messages").get(1).has("_anthropic_content")).isFalse();
        }
    }

    @Nested
    @DisplayName("Ollama : son API, et la fenêtre de contexte de chaque requête")
    class Ollama {

        /** Un document de {@code chars} caractères dans la question. */
        private List<Map<String, Object>> document(int chars) {
            return List.of(Map.of("role", "system", "content", "s"),
                Map.of("role", "user", "content", String.join("", Collections.nCopies(chars, "a"))));
        }

        private JsonNode sentOptions() {
            return http.sent.get(0).body().path("options");
        }

        static Stream<Arguments> reasoning() {
            return Stream.of(
                // Qwen3 sans raisonnement : la directive et le réglage natif.
                Arguments.of("qwen3:8b", false, "hi /no_think", false),
                Arguments.of("qwen3:8b", true, "hi", null),
                Arguments.of("llama3.1:8b", false, "hi", null));
        }

        @ParameterizedTest(name = "{0}, raisonnement {1}")
        @MethodSource("reasoning")
        @DisplayName("par son API, Qwen3 ne raisonne que quand on le lui demande")
        void reasoning(String model, boolean think, String lastMessage, Boolean thinkField) {
            http.reply(200, NATIVE);

            ModelGateway.ChatReply reply = chat(OLLAMA, model, think, 0);

            FakeHttp.Sent request = http.sent.get(0);
            assertThat(request.url()).isEqualTo("http://host.docker.internal:11434/api/chat");
            JsonNode body = request.body();
            assertThat(body.path("messages").get(1).path("content").asText()).isEqualTo(lastMessage);
            assertThat(body.has("think") ? body.path("think").asBoolean() : null).isEqualTo(thinkField);
            assertThat(body.has("reasoning_effort")).isFalse();
            assertThat(body.path("stream").asBoolean(true)).isFalse();
            assertThat(body.path("options").path("temperature").asDouble()).isEqualTo(0.4);
            assertThat(reply.model()).isEqualTo(model);
            assertThat(reply.message().path("content").asText()).isEqualTo("ok");
            assertThat(reply.usage()).isEqualTo(new LlmUsage(3, 1, 4));
        }

        static Stream<Arguments> windows() {
            return Stream.of(
                // Le prompt de Cortex : 8 192, le maximum du modèle ne compte pas.
                Arguments.of(Map.of(), QWEN3_SHOW, "{\"models\":[]}", 9_000, false, 8_192),
                // Un document de 3 000 mots : la fenêtre suivante.
                Arguments.of(Map.of(), QWEN3_SHOW, "{\"models\":[]}", 30_000, false, 16_384),
                // Le palier qui raisonne garde plus de place pour sa réponse.
                Arguments.of(Map.of(), QWEN3_SHOW, "{\"models\":[]}", 9_000, true, 16_384),
                // Plus long que le plafond des réglages : le plafond.
                Arguments.of(Map.of(), QWEN3_SHOW, "{\"models\":[]}", 90_000, false, 16_384),
                // Un plafond relevé : le maximum du modèle l'arrête.
                Arguments.of(Map.of("AI_OLLAMA_MAX_CONTEXT", "65536"), QWEN3_SHOW, "{\"models\":[]}", 200_000, false, 40_960),
                // Le maximum illisible : le plafond des réglages seul.
                Arguments.of(Map.of("AI_OLLAMA_MAX_CONTEXT", "32768"), "{}", "{\"models\":[]}", 200_000, false, 32_768),
                // Déjà chargé avec une fenêtre qui tient la requête : gardée, sans rechargement.
                Arguments.of(Map.of(), QWEN3_SHOW,
                    "{\"models\":[{\"name\":\"qwen3:8b\",\"model\":\"qwen3:8b\",\"context_length\":16384}]}", 9_000, false, 16_384));
        }

        @ParameterizedTest(name = "{3} caractères, raisonnement {4} : {5}")
        @MethodSource("windows")
        @DisplayName("la fenêtre de contexte se taille à la requête, au plus le plafond et le maximum du modèle")
        void window(Map<String, String> env, String show, String ps, int chars, boolean think, int expected) {
            http.read("/api/show", show).read("/api/ps", ps).reply(200, NATIVE);

            ModelGateway.ChatReply reply = gateway.chat(settings(env),
                new ModelGateway.ChatCall(document(chars), null, false, "qwen3:8b", think));

            assertThat(sentOptions().path("num_ctx").asInt()).isEqualTo(expected);
            // La réponse dit la fenêtre donnée à la requête : la jauge de contexte de la conversation la montre.
            assertThat(reply.contextWindow()).isEqualTo(expected);
            assertThat(http.reads).extracting(FakeHttp.Sent::url)
                .containsExactly("http://host.docker.internal:11434/api/show", "http://host.docker.internal:11434/api/ps");
            assertThat(http.reads.get(0).body().path("model").asText()).isEqualTo("qwen3:8b");
            assertThat(http.reads.get(1).timeout()).isEqualTo(ModelGateway.LOADED_TIMEOUT);
        }

        @Test
        @DisplayName("les outils comptent dans la fenêtre, sans tool_choice ; elle ne change pas quand ils sont réduits")
        void toolsCountAndTheWindowHolds() {
            http.read("/api/show", QWEN3_SHOW).reply(400, "{}").reply(200, NATIVE);
            List<Map<String, Object>> big = IntStream.range(0, 40)
                .mapToObj(i -> Map.<String, Object>of("type", "function", "function", Map.of("name", "t" + i,
                    "description", String.join("", Collections.nCopies(600, "d")), "parameters", Map.of("type", "object"))))
                .toList();

            gateway.chat(settings(OLLAMA), new ModelGateway.ChatCall(document(9_000), big, false, "qwen3:8b", false));

            assertThat(http.toolCounts()).containsExactly(40, 20);
            assertThat(http.sent).extracting(s -> s.body().path("options").path("num_ctx").asInt()).containsExactly(16_384, 16_384);
            assertThat(http.sent.get(0).body().has("tool_choice")).isFalse();
        }

        @Test
        @DisplayName("le maximum d'un modèle se lit une fois")
        void readsTheModelMaximumOnce() {
            http.read("/api/show", QWEN3_SHOW).reply(200, NATIVE);

            chat(OLLAMA, "qwen3:8b", false, 0);
            chat(OLLAMA, "qwen3:8b", false, 0);

            assertThat(http.reads).extracting(FakeHttp.Sent::url).filteredOn(url -> url.endsWith("/api/show")).hasSize(1);
            assertThat(http.reads).extracting(FakeHttp.Sent::url).filteredOn(url -> url.endsWith("/api/ps")).hasSize(2);
        }

        @Test
        @DisplayName("une adresse posée, avec /v1 : l'API d'Ollama est à côté, la clé suit")
        void explicitAddress() {
            http.reply(200, NATIVE);

            gateway.chat(settings(Map.of("AI_PROVIDER", "ollama", "AI_BASE_URL", "http://gpu.local:11434/v1",
                "AI_API_KEY", "proxy-key")), new ModelGateway.ChatCall(question(), null, true, "qwen3:8b", false));

            FakeHttp.Sent request = http.sent.get(0);
            assertThat(request.url()).isEqualTo("http://gpu.local:11434/api/chat");
            assertThat(request.headers()).containsEntry("Authorization", "Bearer proxy-key");
            assertThat(request.body().path("format").asText()).isEqualTo("json");
            assertThat(http.reads).extracting(FakeHttp.Sent::url)
                .containsExactly("http://gpu.local:11434/api/show", "http://gpu.local:11434/api/ps");
        }

        @Test
        @DisplayName("un appel d'outil revient au format OpenAI, et repart au format d'Ollama au tour suivant")
        void toolCallRoundTrip() throws Exception {
            http.reply(200, "{\"message\":{\"role\":\"assistant\",\"content\":\"\",\"tool_calls\":[{\"id\":\"call_5anwddur\","
                    + "\"function\":{\"index\":0,\"name\":\"list_issues\",\"arguments\":{\"project\":\"ATLAS\"}}}]},"
                    + "\"prompt_eval_count\":163,\"eval_count\":21}")
                .reply(200, NATIVE);

            ObjectNode message = chat(OLLAMA, "qwen3:8b", false, 1).message();
            JsonNode call = message.path("tool_calls").get(0);
            assertThat(call.path("id").asText()).isEqualTo("call_5anwddur");
            assertThat(JSON.readTree(call.path("function").path("arguments").asText()).path("project").asText()).isEqualTo("ATLAS");

            List<Object> loop = new ArrayList<>(question());
            loop.add(JSON.convertValue(message, Map.class));
            loop.add(Map.of("role", "tool", "tool_call_id", "call_5anwddur", "content", "ATLAS-1 Login form"));
            gateway.chat(settings(OLLAMA), new ModelGateway.ChatCall(loop, tools(1), false, "qwen3:8b", false));

            JsonNode sent = http.sent.get(1).body().path("messages");
            assertThat(sent.get(2).path("tool_calls").get(0).path("function").path("arguments").path("project").asText())
                .isEqualTo("ATLAS");
            assertThat(sent.get(3).path("tool_name").asText()).isEqualTo("list_issues");
        }

        @Test
        @DisplayName("une réponse sans message est une panne du fournisseur")
        void noMessage() {
            http.reply(200, "{\"done\":true}");

            assertThatThrownBy(() -> chat(OLLAMA, "qwen3:8b", false, 0))
                .isInstanceOf(ModelProviderException.class).hasMessageContaining("without a message");
        }

        static Stream<Arguments> statusWindows() {
            return Stream.of(
                Arguments.of(Map.of(), QWEN3_SHOW, 16_384),
                Arguments.of(Map.of("AI_OLLAMA_MAX_CONTEXT", "65536"), QWEN3_SHOW, 40_960),
                Arguments.of(Map.of("AI_OLLAMA_MAX_CONTEXT", "8192"), QWEN3_SHOW, 8_192),
                Arguments.of(Map.of(), "{}", 16_384));
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("statusWindows")
        @DisplayName("pour l'état de l'IA : la plus grande fenêtre qu'un modèle reçoit")
        void contextWindow(Map<String, String> env, String show, int expected) {
            http.read("/api/show", show);

            assertThat(gateway.contextWindow(settings(env), "qwen3:8b")).contains(expected);
        }

        @Test
        @DisplayName("la fiche d'un modèle se lit une fois dans /api/show, et sert aussi sa fenêtre")
        void describesAModelOnce() {
            http.read("/api/show", "{\"details\":{\"parameter_size\":\"8.2B\"},\"model_info\":{\"general.architecture\":"
                + "\"qwen3\",\"qwen3.context_length\":40960},\"capabilities\":[\"completion\",\"tools\"]}");

            assertThat(gateway.describe(settings(OLLAMA), "qwen3:8b"))
                .contains(new ModelGateway.ModelCard("8.2B", 40960, true));
            assertThat(gateway.describe(settings(OLLAMA), "qwen3:8b")).isPresent();
            assertThat(gateway.contextWindow(settings(OLLAMA), "qwen3:8b")).contains(16_384);

            assertThat(http.reads).hasSize(1);
            assertThat(http.reads.get(0).body().path("model").asText()).isEqualTo("qwen3:8b");
        }

        @Test
        @DisplayName("une fiche illisible ne dit rien, et se relit la fois suivante")
        void anUnreadableCardSaysNothing() {
            assertThat(gateway.describe(settings(OLLAMA), "qwen3:8b")).isEmpty();
            assertThat(gateway.describe(settings(OLLAMA), "qwen3:8b")).isEmpty();

            assertThat(http.reads).hasSize(2);
        }

        @Test
        @DisplayName("ailleurs qu'Ollama, ou sans IA ni modèle, la passerelle ne dit pas de fiche")
        void noCardElsewhere() {
            assertThat(gateway.describe(settings(COMPATIBLE), "qwen3:8b")).isEmpty();
            assertThat(gateway.describe(settings(Map.of("AI_PROVIDER", "anthropic")), "claude-opus-5-5")).isEmpty();
            assertThat(gateway.describe(settings(Map.of("AI_PROVIDER", "none")), "qwen3:8b")).isEmpty();
            assertThat(gateway.describe(settings(OLLAMA), " ")).isEmpty();
            assertThat(http.reads).isEmpty();
        }

        @Test
        @DisplayName("ailleurs qu'Ollama, ou sans IA ni modèle, la passerelle ne dit pas de fenêtre")
        void noContextWindowElsewhere() {
            assertThat(gateway.contextWindow(settings(COMPATIBLE), "qwen3:8b")).isEmpty();
            assertThat(gateway.contextWindow(settings(Map.of("AI_PROVIDER", "anthropic")), "claude-opus-5-5")).isEmpty();
            assertThat(gateway.contextWindow(settings(Map.of("AI_PROVIDER", "none")), "qwen3:8b")).isEmpty();
            assertThat(gateway.contextWindow(settings(OLLAMA), null)).isEmpty();
            assertThat(http.reads).isEmpty();
        }
    }

    @Nested
    @DisplayName("API d'Anthropic")
    class Anthropic {

        private final Map<String, String> env = Map.of("AI_PROVIDER", "anthropic", "AI_API_KEY", "sk-ant-test");

        private static final String TOOL_USE = "{\"id\":\"msg_1\",\"model\":\"claude-opus-5-5\",\"stop_reason\":\"tool_use\","
            + "\"content\":[{\"type\":\"thinking\",\"thinking\":\"\",\"signature\":\"sig\"},"
            + "{\"type\":\"text\",\"text\":\"Let me look.\"},"
            + "{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"search_brain\",\"input\":{\"query\":\"blocked\"}}],"
            + "\"usage\":{\"input_tokens\":10,\"output_tokens\":5,\"cache_read_input_tokens\":2}}";
        private static final String ANSWER = "{\"stop_reason\":\"end_turn\",\"content\":[{\"type\":\"text\",\"text\":\"Two issues.\"}],"
            + "\"usage\":{\"input_tokens\":20,\"output_tokens\":4}}";

        @Test
        @DisplayName("en-têtes, système, outils au format d'Anthropic, sans température ni outil imposé")
        void request() {
            http.reply(200, ANSWER);

            gateway.chat(settings(env), new ModelGateway.ChatCall(question(), tools(2), false, "claude-opus-5-5", false));

            FakeHttp.Sent request = http.sent.get(0);
            assertThat(request.url()).isEqualTo("https://api.anthropic.com/v1/messages");
            assertThat(request.headers()).containsEntry("x-api-key", "sk-ant-test")
                .containsEntry("anthropic-version", AnthropicProtocol.VERSION)
                .doesNotContainKey("Authorization");
            JsonNode body = request.body();
            assertThat(body.path("system").asText()).isEqualTo("s");
            assertThat(body.path("max_tokens").asInt()).isEqualTo(16_000);
            assertThat(body.path("messages")).hasSize(1);
            assertThat(body.path("messages").get(0).path("content").get(0).path("text").asText()).isEqualTo("hi");
            assertThat(body.path("tools").get(1).path("name").asText()).isEqualTo("t1");
            assertThat(body.path("tools").get(1).path("input_schema").path("type").asText()).isEqualTo("object");
            assertThat(body.path("tool_choice").path("type").asText()).isEqualTo("auto");
            assertThat(body.has("temperature")).isFalse();
        }

        @Test
        @DisplayName("un appel d'outil revient au format OpenAI, avec son contenu d'origine pour le tour suivant")
        void toolUseRoundTrip() throws Exception {
            http.reply(200, TOOL_USE).reply(200, ANSWER);
            AiProviderSettings s = settings(env);

            ModelGateway.ChatReply first = gateway.chat(s,
                new ModelGateway.ChatCall(question(), tools(1), false, "claude-opus-5-5", false));
            ObjectNode message = first.message();
            assertThat(message.path("content").asText()).isEqualTo("Let me look.");
            JsonNode call = message.path("tool_calls").get(0);
            assertThat(call.path("id").asText()).isEqualTo("toolu_1");
            assertThat(call.path("function").path("name").asText()).isEqualTo("search_brain");
            assertThat(JSON.readTree(call.path("function").path("arguments").asText()).path("query").asText()).isEqualTo("blocked");
            assertThat(first.usage().promptTokens()).isEqualTo(12);
            assertThat(first.usage().totalTokens()).isEqualTo(17);

            // La boucle d'agent renvoie le message tel quel, puis le résultat de l'outil.
            List<Object> loop = new ArrayList<>(question());
            loop.add(JSON.convertValue(message, Map.class));
            loop.add(Map.of("role", "tool", "tool_call_id", "toolu_1", "content", "PRJ-12 waits for PRJ-9"));
            ModelGateway.ChatReply second = gateway.chat(s, new ModelGateway.ChatCall(loop, tools(1), false, "claude-opus-5-5", false));

            JsonNode messages = http.sent.get(1).body().path("messages");
            assertThat(messages).hasSize(3);
            JsonNode assistant = messages.get(1);
            assertThat(assistant.path("role").asText()).isEqualTo("assistant");
            assertThat(assistant.path("content").get(0).path("type").asText()).isEqualTo("thinking");
            assertThat(assistant.path("content").get(0).path("signature").asText()).isEqualTo("sig");
            JsonNode result = messages.get(2).path("content").get(0);
            assertThat(result.path("type").asText()).isEqualTo("tool_result");
            assertThat(result.path("tool_use_id").asText()).isEqualTo("toolu_1");
            assertThat(second.message().path("content").asText()).isEqualTo("Two issues.");
            assertThat(second.message().has("tool_calls")).isFalse();
        }

        @Test
        @DisplayName("sans contenu d'origine, les appels d'outils au format OpenAI deviennent des blocs tool_use")
        void openAiToolCallsBecomeToolUse() {
            http.reply(200, ANSWER);
            List<Map<String, Object>> messages = List.of(Map.of("role", "user", "content", "q"),
                Map.of("role", "assistant", "content", "", "tool_calls", List.of(Map.of("id", "call_1", "type", "function",
                    "function", Map.of("name", "search_brain", "arguments", "{\"query\":\"x\"}")))),
                Map.of("role", "tool", "tool_call_id", "call_1", "content", ""));

            gateway.chat(settings(env), new ModelGateway.ChatCall(messages, List.of(), false, "claude-opus-5-5", false));

            JsonNode sent = http.sent.get(0).body().path("messages");
            JsonNode use = sent.get(1).path("content").get(0);
            assertThat(use.path("type").asText()).isEqualTo("tool_use");
            assertThat(use.path("input").path("query").asText()).isEqualTo("x");
            assertThat(sent.get(2).path("content").get(0).path("content").asText()).isEqualTo("(no output)");
        }

        @Test
        @DisplayName("historique tronqué : il commence par la personne, et deux tours de suite du même rôle n'en font qu'un")
        void historyStartsWithTheUser() {
            http.reply(200, ANSWER);
            List<Map<String, Object>> messages = List.of(Map.of("role", "system", "content", "Summary: earlier."),
                Map.of("role", "assistant", "content", "An old answer."),
                Map.of("role", "user", "content", "First."),
                Map.of("role", "user", "content", "Second."));

            gateway.chat(settings(env), new ModelGateway.ChatCall(messages, List.of(), false, "claude-opus-5-5", false));

            JsonNode sent = http.sent.get(0).body();
            assertThat(sent.path("system").asText()).isEqualTo("Summary: earlier.");
            assertThat(sent.path("messages")).hasSize(1);
            assertThat(sent.path("messages").get(0).path("role").asText()).isEqualTo("user");
            assertThat(sent.path("messages").get(0).path("content")).hasSize(2);
        }

        @Test
        @DisplayName("mode JSON : la consigne dans le système, l'objet extrait de la réponse")
        void jsonMode() {
            http.reply(200, "{\"content\":[{\"type\":\"text\",\"text\":\"Here it is:\\n```json\\n{\\\"skills\\\":[\\\"java\\\"]}\\n```\"}]}");

            ModelGateway.ChatReply reply = gateway.chat(settings(env),
                new ModelGateway.ChatCall(question(), null, true, "claude-haiku-5-5", false));

            assertThat(http.sent.get(0).body().path("system").asText()).endsWith(AnthropicProtocol.JSON_INSTRUCTION);
            assertThat(reply.message().path("content").asText()).isEqualTo("{\"skills\":[\"java\"]}");
        }

        @Test
        @DisplayName("un refus du modèle se dit, au lieu d'une réponse vide")
        void refusal() {
            http.reply(200, "{\"stop_reason\":\"refusal\",\"content\":[]}");

            assertThat(chat(env, "claude-opus-5-5", false, 0).message().path("content").asText())
                .isEqualTo(AnthropicProtocol.REFUSAL);
        }

        @Test
        @DisplayName("un 400 qui parle des outils les réduit ; un autre 400 est un refus ordinaire")
        void onlyToolErrorsHalveTheTools() {
            http.reply(400, "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"tools.3.input_schema: invalid\"}}")
                .reply(200, ANSWER);
            chat(env, "claude-opus-5-5", false, 8);
            assertThat(http.toolCounts()).containsExactly(8, 4);

            http.sent.clear();
            http.replies.clear();
            http.reply(400, "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long\"}}");
            assertThatThrownBy(() -> chat(env, "claude-opus-5-5", false, 8))
                .isInstanceOf(ModelProviderException.class)
                .isNotInstanceOf(ModelProviderException.ToolsRefused.class)
                .hasMessage("AI provider refused the request (HTTP 400)");
            assertThat(http.toolCounts()).containsExactly(8);
        }

        @Test
        @DisplayName("un bloc de raisonnement refusé : on redemande une fois sans eux")
        void dropsRefusedThinking() {
            http.reply(200, TOOL_USE)
                .reply(400, "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\","
                    + "\"message\":\"messages.1.content.0: Invalid `signature` in `thinking` block.\"}}")
                .reply(200, ANSWER);
            AiProviderSettings s = settings(env);
            ObjectNode message = gateway.chat(s, new ModelGateway.ChatCall(question(), List.of(), false, "m", false)).message();
            List<Object> loop = new ArrayList<>(question());
            loop.add(JSON.convertValue(message, Map.class));
            loop.add(Map.of("role", "tool", "tool_call_id", "toolu_1", "content", "r"));

            gateway.chat(s, new ModelGateway.ChatCall(loop, List.of(), false, "m", false));

            assertThat(http.sent).hasSize(3);
            assertThat(http.sent.get(1).body().path("messages").get(1).path("content").get(0).path("type").asText())
                .isEqualTo("thinking");
            assertThat(http.sent.get(2).body().path("messages").get(1).path("content").get(0).path("type").asText())
                .isEqualTo("text");
        }

        @Test
        @DisplayName("la liste des modèles se lit en entier, avec la clé d'Anthropic")
        void listsModels() {
            http.reply(200, "{\"data\":[{\"id\":\"claude-opus-5-5\"},{\"id\":\"claude-haiku-5-5\"}],\"has_more\":false}");

            assertThat(gateway.chatModels(settings(env))).contains(List.of("claude-opus-5-5", "claude-haiku-5-5"));
            assertThat(http.sent.get(0).url()).isEqualTo("https://api.anthropic.com/v1/models?limit=1000");
            assertThat(http.sent.get(0).headers()).containsEntry("x-api-key", "sk-ant-test");
            assertThat(http.sent.get(0).timeout()).isEqualTo(ModelGateway.PROBE_TIMEOUT);
        }
    }

    @Nested
    @DisplayName("vecteurs, modèles, IA coupée")
    class Embeddings {

        @Test
        @DisplayName("les vecteurs reviennent dans l'ordre des textes")
        void inOrder() {
            String one = "[" + String.join(",", java.util.Collections.nCopies(1024, "1.0")) + "]";
            String two = "[" + String.join(",", java.util.Collections.nCopies(1024, "2.0")) + "]";
            http.reply(200, "{\"data\":[{\"index\":1,\"embedding\":" + two + "},{\"index\":0,\"embedding\":" + one + "}]}");

            List<float[]> vectors = gateway.embed(settings(Map.of()), "bge-m3", List.of("a", "b"));

            assertThat(vectors).extracting(v -> v[0]).containsExactly(1.0f, 2.0f);
            assertThat(http.sent.get(0).url()).isEqualTo("http://host.docker.internal:11434/v1/embeddings");
            assertThat(http.sent.get(0).body().path("model").asText()).isEqualTo("bge-m3");
            assertThat(http.sent.get(0).body().path("input")).hasSize(2);
        }

        static Stream<String> invalid() {
            String short768 = "[" + String.join(",", java.util.Collections.nCopies(768, "0.1")) + "]";
            return Stream.of(
                "{\"data\":[{\"index\":0,\"embedding\":" + short768 + "}]}",
                "{\"data\":[]}",
                "{\"error\":\"model not found\"}");
        }

        @ParameterizedTest
        @MethodSource("invalid")
        @DisplayName("des vecteurs que la base ne peut pas ranger sont refusés")
        void refusesInvalidVectors(String payload) {
            http.reply(200, payload);

            assertThatThrownBy(() -> gateway.embed(settings(Map.of()), "bge-m3", List.of("a")))
                .isInstanceOf(ModelProviderException.class);
        }

        @Test
        @DisplayName("sans texte, aucun appel")
        void noText() {
            assertThat(gateway.embed(settings(Map.of()), "bge-m3", List.of())).isEmpty();
            assertThat(http.sent).isEmpty();
        }

        @Test
        @DisplayName("IA coupée : ni conversation ni vecteurs, aucun appel")
        void off() {
            AiProviderSettings off = settings(Map.of("AI_PROVIDER", "none"));

            assertThatThrownBy(() -> gateway.chat(off, new ModelGateway.ChatCall(question(), null, false, "m", false)))
                .isInstanceOf(ModelProviderException.class);
            assertThatThrownBy(() -> gateway.embed(off, "bge-m3", List.of("x"))).isInstanceOf(ModelProviderException.class);
            assertThat(http.sent).isEmpty();
        }

        @Test
        @DisplayName("la liste des modèles : vide si le fournisseur ne répond pas ou refuse")
        void modelsProbe() {
            http.reply(200, "{\"data\":[{\"id\":\"qwen3:8b\"},{\"id\":\"bge-m3:latest\"}]}");
            assertThat(gateway.chatModels(settings(Map.of()))).contains(List.of("qwen3:8b", "bge-m3:latest"));

            http.replies.clear();
            http.reply(401, "{}");
            assertThat(gateway.embedModels(settings(Map.of()))).isEmpty();

            http.replies.clear();
            http.fail(new ConnectException("refused"));
            assertThat(gateway.chatModels(settings(Map.of()))).isEmpty();
        }
    }
}
