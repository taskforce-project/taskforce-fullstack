package com.taskforce.tf_api.core.service.ai;

import java.io.IOException;
import java.net.ConnectException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
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
import org.junit.jupiter.params.provider.ValueSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

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

    /** Fournisseur rejoué : les réponses dans l'ordre, les requêtes gardées. */
    static final class FakeHttp implements ModelHttp {
        record Sent(String method, String url, Map<String, String> headers, JsonNode body, Duration timeout) {
        }

        final List<Sent> sent = new ArrayList<>();
        final Deque<Object> replies = new ArrayDeque<>();

        FakeHttp reply(int status, String body) {
            replies.add(new Reply(status, body));
            return this;
        }

        FakeHttp fail(IOException failure) {
            replies.add(failure);
            return this;
        }

        @Override
        public Reply send(String method, String url, Map<String, String> headers, String body, Duration timeout)
            throws IOException {
            sent.add(new Sent(method, url, headers, body == null ? null : JSON.readTree(body), timeout));
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

    @Nested
    @DisplayName("API compatible OpenAI")
    class OpenAi {

        static Stream<Arguments> reasoning() {
            return Stream.of(
                // Qwen3 sur Ollama, sans raisonnement : la directive et le réglage natif.
                Arguments.of(Map.of(), "qwen3:8b", false, "hi /no_think", "none"),
                Arguments.of(Map.of(), "qwen3:8b", true, "hi", null),
                Arguments.of(Map.of(), "llama3.1:8b", false, "hi", null),
                // Ailleurs, la directive seule : le réglage d'Ollama n'y est pas garanti.
                Arguments.of(Map.of("GROQ_API_KEY", "gsk"), "qwen/qwen3-32b", false, "hi /no_think", null),
                Arguments.of(Map.of("AI_BASE_URL", "https://api.example.com/v1"), "qwen3:8b", false, "hi /no_think", null),
                Arguments.of(Map.of("GROQ_API_KEY", "gsk"), "openai/gpt-oss-20b", false, "hi", null));
        }

        @ParameterizedTest(name = "{1}, raisonnement {2}")
        @MethodSource("reasoning")
        @DisplayName("Qwen3 ne raisonne que quand on le lui demande")
        void reasoning(Map<String, String> env, String model, boolean think, String lastMessage, String effort) {
            http.reply(200, CHOICE);

            ModelGateway.ChatReply reply = chat(env, model, think, 0);

            JsonNode body = http.sent.get(0).body();
            assertThat(body.path("model").asText()).isEqualTo(model);
            assertThat(body.path("messages").get(1).path("content").asText()).isEqualTo(lastMessage);
            assertThat(body.path("reasoning_effort").isMissingNode() ? null : body.path("reasoning_effort").asText())
                .isEqualTo(effort);
            assertThat(reply.model()).isEqualTo(model);
            assertThat(reply.message().path("content").asText()).isEqualTo("ok");
            assertThat(reply.usage().totalTokens()).isEqualTo(4);
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

        @Test
        @DisplayName("ni clé ni contenu propre à Anthropic vers Ollama")
        void noKeyNoForeignContent() {
            http.reply(200, CHOICE);
            List<Map<String, Object>> messages = List.of(Map.of("role", "user", "content", "q"),
                Map.of("role", "assistant", "content", "", "_anthropic_content", List.of(Map.of("type", "thinking"))),
                Map.of("role", "tool", "tool_call_id", "c1", "content", "r"));

            gateway.chat(settings(Map.of()), new ModelGateway.ChatCall(messages, List.of(), false, "llama3.1:8b", false));

            assertThat(http.sent.get(0).headers()).doesNotContainKey("Authorization");
            assertThat(http.sent.get(0).body().path("messages").get(1).has("_anthropic_content")).isFalse();
        }

        @Test
        @DisplayName("retire un bloc de raisonnement resté dans la réponse")
        void stripsThinking() {
            http.reply(200, "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"<think>x</think>\\n{\\\"a\\\":1}\"}}]}");

            assertThat(chat(Map.of(), "qwen3:8b", true, 0).message().path("content").asText()).isEqualTo("{\"a\":1}");
        }

        @ParameterizedTest(name = "HTTP {0}")
        @ValueSource(ints = {400, 413})
        @DisplayName("trop d'outils : on redemande avec moitié moins")
        void halvesTheTools(int status) {
            http.reply(status, "{}").reply(status, "{}").reply(200, CHOICE);

            chat(Map.of(), "qwen3:8b", false, 8);

            assertThat(http.toolCounts()).containsExactly(8, 4, 2);
            assertThat(http.sent.get(0).body().path("tool_choice").asText()).isEqualTo("auto");
        }

        @Test
        @DisplayName("jamais sans les outils : refusés jusqu'au dernier, on le dit")
        void neverWithoutTools() {
            http.reply(400, "{}");

            assertThatThrownBy(() -> chat(Map.of(), "qwen3:8b", false, 8))
                .isInstanceOf(ModelProviderException.ToolsRefused.class)
                .hasMessage("AI provider refused the tools (HTTP 400)");
            assertThat(http.toolCounts()).containsExactly(8, 4, 2, 1);
        }

        @Test
        @DisplayName("trop gros même avec un seul outil : la conversation, pas les outils")
        void tooLargeIsNotAToolRefusal() {
            http.reply(413, "{}");

            assertThatThrownBy(() -> chat(Map.of(), "qwen3:8b", false, 4))
                .isInstanceOf(ModelProviderException.class)
                .isNotInstanceOf(ModelProviderException.ToolsRefused.class)
                .hasMessageContaining("too large");
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

        @ParameterizedTest(name = "HTTP {0}")
        @ValueSource(ints = {401, 404, 429, 500})
        @DisplayName("refus du fournisseur, sans outils à réduire")
        void providerRefusal(int status) {
            http.reply(status, "{}");

            assertThatThrownBy(() -> chat(Map.of(), "qwen3:8b", false, 0))
                .isInstanceOf(ModelProviderException.class)
                .hasMessage("AI provider refused the request (HTTP " + status + ")");
        }

        @Test
        @DisplayName("fournisseur injoignable, ou réponse sans choix")
        void unreachableOrEmpty() {
            http.fail(new ConnectException("refused"));
            assertThatThrownBy(() -> chat(Map.of(), "qwen3:8b", false, 0))
                .isInstanceOf(ModelProviderException.class).hasMessageContaining("unreachable");

            http.replies.clear();
            http.reply(200, "{\"choices\":[]}");
            assertThatThrownBy(() -> chat(Map.of(), "qwen3:8b", false, 0))
                .isInstanceOf(ModelProviderException.class).hasMessageContaining("without choices");
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
