package com.taskforce.tf_api.core.service.ai;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.service.LlmUsage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** L'API d'Ollama : la fenêtre de contexte d'une requête, et la traduction depuis et vers le format OpenAI du backend. */
@DisplayName("OllamaProtocol")
class OllamaProtocolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode json(String text) throws Exception {
        return JSON.readTree(text);
    }

    @ParameterizedTest(name = "{0} jetons demandés, plafond {1}, chargé à {2} : {3}")
    @CsvSource({
        // Le prompt de Cortex et sa réponse : la plus petite fenêtre.
        "5000,   16384, 0,     8192",
        "8192,   16384, 0,     8192",
        // Au-delà, la puissance de deux au-dessus.
        "8193,   16384, 0,     16384",
        "12000,  16384, 0,     16384",
        // Plus que le plafond : le plafond (Ollama retire alors les messages les plus anciens).
        "30000,  16384, 0,     16384",
        "30000,  65536, 0,     32768",
        "50000,  40960, 0,     40960",
        // Un plafond sous 8 192 (petite carte, petit modèle) l'emporte.
        "1000,   4096,  0,     4096",
        // Un modèle chargé avec une fenêtre qui tient la requête la garde : pas de rechargement.
        "5000,   16384, 16384, 16384",
        "5000,   16384, 12288, 12288",
        // Chargé trop petit, ou au-delà du plafond : la fenêtre de la requête.
        "12000,  16384, 8192,  16384",
        "5000,   16384, 32768, 8192",
    })
    @DisplayName("la fenêtre : ce que demande la requête, arrondi, au plus le plafond, sans recharger pour rien")
    void window(int needed, int ceiling, int loaded, int expected) {
        assertThat(OllamaProtocol.window(needed, ceiling, loaded)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "{0} jetons, raisonnement {1}, plafond {2} : {3} jetons demandés")
    @CsvSource({
        "0,     false, 16384, 2048",
        "1000,  false, 16384, 3048",
        "1000,  true,  16384, 9192",
        "10000, false, 16384, 12048",
        // Un petit plafond : la réponse garde un quart de la fenêtre, sa moitié si le modèle raisonne.
        "1000,  false, 4096,  2024",
        "1000,  true,  4096,  3048",
    })
    @DisplayName("ce que demande une requête : ses jetons, plus la place que le budget garde à la réponse")
    void needed(int tokens, boolean think, int ceiling, int expected) {
        assertThat(OllamaProtocol.needed(tokens, think, ceiling)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "réglage {0}, maximum {1} : {2}")
    @CsvSource({"16384, 40960, 16384", "65536, 40960, 40960", "16384, 8192, 8192", "16384, 0, 16384"})
    @DisplayName("le plafond : le réglage, ou le maximum du modèle s'il est plus petit (0 : inconnu)")
    void ceiling(int setting, int maximum, int expected) {
        assertThat(OllamaProtocol.ceiling(setting, maximum)).isEqualTo(expected);
    }

    static Stream<Arguments> shows() {
        return Stream.of(
            Arguments.of("{\"model_info\":{\"general.architecture\":\"qwen3\",\"qwen3.context_length\":40960}}", 40960),
            Arguments.of("{\"model_info\":{\"general.architecture\":\"qwen35\",\"qwen35.context_length\":262144,"
                + "\"qwen35.vision.block_count\":27}}", 262144),
            // Sans architecture, la première clé qui en a l'air.
            Arguments.of("{\"model_info\":{\"llama.context_length\":131072}}", 131072),
            Arguments.of("{\"model_info\":{\"general.architecture\":\"bert\"}}", 0),
            Arguments.of("{\"error\":\"model 'nope' not found\"}", 0));
    }

    @ParameterizedTest
    @MethodSource("shows")
    @DisplayName("le maximum d'un modèle se lit dans /api/show")
    void contextLength(String show, int expected) throws Exception {
        assertThat(OllamaProtocol.contextLength(json(show))).isEqualTo(expected);
    }

    static Stream<Arguments> cards() {
        return Stream.of(
            Arguments.of("{\"details\":{\"parameter_size\":\"8.2B\",\"quantization_level\":\"Q4_K_M\"},"
                + "\"model_info\":{\"general.architecture\":\"qwen3\",\"qwen3.context_length\":40960},"
                + "\"capabilities\":[\"completion\",\"tools\",\"thinking\"]}", "8.2B", 40960, true),
            // Une fiche sans outils : la liste le dit, le modèle n'en prend pas.
            Arguments.of("{\"details\":{\"parameter_size\":\"567.75M\"},\"model_info\":{\"general.architecture\":\"bert\"},"
                + "\"capabilities\":[\"embedding\"]}", "567.75M", null, false),
            // Un Ollama d'avant la liste des capacités : on ne sait pas.
            Arguments.of("{\"details\":{\"parameter_size\":\" 7.6B \"},\"model_info\":{\"llama.context_length\":131072}}",
                "7.6B", 131072, null),
            Arguments.of("{\"error\":\"model 'nope' not found\"}", null, null, null));
    }

    @ParameterizedTest
    @MethodSource("cards")
    @DisplayName("la fiche d'un modèle se lit dans /api/show : sa taille, sa fenêtre, ses outils, sans rien inventer")
    void card(String show, String parameters, Integer contextLength, Boolean tools) throws Exception {
        assertThat(OllamaProtocol.card(json(show))).isEqualTo(new ModelGateway.ModelCard(parameters, contextLength, tools));
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"qwen3:8b, 16384", "qwen3, 4096", "qwen3:14b, 0", "bge-m3, 0"})
    @DisplayName("la fenêtre du modèle chargé se lit dans /api/ps, un nom sans étiquette vaut :latest")
    void loadedWindow(String model, int expected) throws Exception {
        JsonNode ps = json("{\"models\":[{\"name\":\"qwen3:8b\",\"model\":\"qwen3:8b\",\"context_length\":16384},"
            + "{\"name\":\"qwen3:latest\",\"model\":\"qwen3:latest\",\"context_length\":4096},"
            + "{\"name\":\"bge-m3:latest\",\"model\":\"bge-m3:latest\"}]}");

        assertThat(OllamaProtocol.loadedWindow(ps, model)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({
        "http://host.docker.internal:11434/v1, http://host.docker.internal:11434",
        "http://gpu.local:11434,               http://gpu.local:11434",
        "https://ollama.example/v1,            https://ollama.example",
    })
    @DisplayName("l'API d'Ollama est à l'adresse des réglages, sans /v1")
    void nativeBase(String base, String expected) {
        assertThat(OllamaProtocol.nativeBase(base)).isEqualTo(expected);
    }

    static Stream<Arguments> requests() {
        return Stream.of(
            Arguments.of("qwen3:8b", false, false, "hi /no_think", false),
            Arguments.of("qwen3:8b", true, false, "hi", null),
            Arguments.of("llama3.1:8b", false, true, "hi", null));
    }

    @ParameterizedTest(name = "{0}, raisonnement {1}, JSON {2}")
    @MethodSource("requests")
    @DisplayName("la requête : sans flux, la température dans les options, Qwen3 sans raisonnement, le mode JSON")
    void request(String model, boolean think, boolean jsonMode, String lastMessage, Boolean thinkField) {
        ObjectNode body = OllamaProtocol.request(JSON, List.of(Map.of("role", "user", "content", "hi")), model, think,
            jsonMode, 0.4);

        assertThat(body.path("model").asText()).isEqualTo(model);
        assertThat(body.path("stream").asBoolean(true)).isFalse();
        assertThat(body.path("messages").get(0).path("content").asText()).isEqualTo(lastMessage);
        assertThat(body.has("think") ? body.path("think").asBoolean() : null).isEqualTo(thinkField);
        assertThat(body.has("format")).isEqualTo(jsonMode);
        assertThat(body.path("options").path("temperature").asDouble()).isEqualTo(0.4);
    }

    @Test
    @DisplayName("l'historique : arguments en objet, résultat d'outil nommé, contenu toujours en texte")
    void messages() {
        List<Map<String, Object>> loop = List.of(
            Map.of("role", "user", "content", List.of(Map.of("type", "text", "text", "Move"),
                Map.of("type", "text", "text", "ATLAS-3"))),
            Map.of("role", "assistant", "content", "", "tool_calls", List.of(
                Map.of("id", "call_1", "type", "function",
                    "function", Map.of("name", "update_issue", "arguments", "{\"issue\":\"ATLAS-3\"}")),
                Map.of("id", "call_2", "type", "function", "function", Map.of("name", "list_issues", "arguments", "oops")))),
            Map.of("role", "tool", "tool_call_id", "call_1", "content", "Moved"),
            Map.of("role", "tool", "tool_call_id", "call_2", "content", "none"));

        JsonNode sent = OllamaProtocol.messages(JSON, loop, "llama3.1:8b", false);

        assertThat(sent.get(0).path("content").asText()).isEqualTo("Move\nATLAS-3");
        JsonNode call = sent.get(1).path("tool_calls").get(0);
        assertThat(call.has("type")).isFalse();
        assertThat(call.path("id").asText()).isEqualTo("call_1");
        assertThat(call.path("function").path("arguments").path("issue").asText()).isEqualTo("ATLAS-3");
        assertThat(sent.get(1).path("tool_calls").get(1).path("function").path("arguments").isObject()).isTrue();
        assertThat(sent.get(2).path("tool_name").asText()).isEqualTo("update_issue");
        assertThat(sent.get(3).path("tool_name").asText()).isEqualTo("list_issues");
        // La liste de l'appelant n'a pas changé.
        assertThat(((Map<?, ?>) ((List<?>) loop.get(1).get("tool_calls")).get(0)).get("type")).isEqualTo("function");
    }

    @Test
    @DisplayName("la réponse revient au format OpenAI : arguments en chaîne, un identifiant par appel, sans le raisonnement")
    void message() throws Exception {
        JsonNode payload = json("{\"message\":{\"role\":\"assistant\",\"content\":\"\",\"thinking\":\"hmm\","
            + "\"tool_calls\":[{\"id\":\"call_5anwddur\",\"function\":{\"index\":0,\"name\":\"list_issues\","
            + "\"arguments\":{\"project\":\"ATLAS\"}}},{\"function\":{\"name\":\"search_brain\",\"arguments\":{}}}]},"
            + "\"prompt_eval_count\":163,\"eval_count\":21}");

        ObjectNode message = OllamaProtocol.message(JSON, payload);

        assertThat(message.path("role").asText()).isEqualTo("assistant");
        assertThat(message.has("thinking")).isFalse();
        JsonNode first = message.path("tool_calls").get(0);
        assertThat(first.path("id").asText()).isEqualTo("call_5anwddur");
        assertThat(first.path("type").asText()).isEqualTo("function");
        assertThat(first.path("function").path("name").asText()).isEqualTo("list_issues");
        assertThat(JSON.readTree(first.path("function").path("arguments").asText()).path("project").asText()).isEqualTo("ATLAS");
        assertThat(message.path("tool_calls").get(1).path("id").asText()).startsWith("call_");
        assertThat(OllamaProtocol.usage(payload)).isEqualTo(new LlmUsage(163, 21, 184));
    }

    @Test
    @DisplayName("une réponse sans message est une panne du fournisseur")
    void noMessage() throws Exception {
        assertThatThrownBy(() -> OllamaProtocol.message(JSON, json("{\"error\":\"boom\"}")))
            .isInstanceOf(ModelProviderException.class).hasMessageContaining("without a message");
    }
}
