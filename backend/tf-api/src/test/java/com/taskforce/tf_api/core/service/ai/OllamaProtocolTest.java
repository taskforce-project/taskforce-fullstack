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
                + "\"capabilities\":[\"completion\",\"tools\",\"thinking\"]}", "8.2B", 40960, true, true),
            // Une fiche sans outils : la liste le dit, le modèle n'en prend pas.
            Arguments.of("{\"details\":{\"parameter_size\":\"567.75M\"},\"model_info\":{\"general.architecture\":\"bert\"},"
                + "\"capabilities\":[\"embedding\"]}", "567.75M", null, false, false),
            // Un Ollama d'avant la liste des capacités : on ne sait pas.
            Arguments.of("{\"details\":{\"parameter_size\":\" 7.6B \"},\"model_info\":{\"llama.context_length\":131072}}",
                "7.6B", 131072, null, null),
            Arguments.of("{\"error\":\"model 'nope' not found\"}", null, null, null, null));
    }

    @ParameterizedTest
    @MethodSource("cards")
    @DisplayName("la fiche d'un modèle se lit dans /api/show : sa taille, sa fenêtre, ses outils, sans rien inventer")
    void card(String show, String parameters, Integer contextLength, Boolean tools, Boolean chat) throws Exception {
        ModelGateway.ModelCard card = OllamaProtocol.card(json(show));

        assertThat(card.parameters()).isEqualTo(parameters);
        assertThat(card.contextLength()).isEqualTo(contextLength);
        assertThat(card.tools()).isEqualTo(tools);
        assertThat(card.chat()).isEqualTo(chat);
    }

    /** Les fiches telles qu'Ollama 0.40.15 les rend pour les modèles de la Présidence (09/11/2026), réduites à ce qui décide. */
    static Stream<Arguments> realCards() {
        String fim = "{{- if .Suffix }}<|fim_prefix|>{{ .Prompt }}<|fim_suffix|>{{ .Suffix }}<|fim_middle|>{{ else }}{{ .Prompt }}{{ end }}";
        String chatml = "{{- range $i, $_ := .Messages }}<|im_start|>{{ .Role }}\\n{{ .Content }}<|im_end|>{{ end }}";
        return Stream.of(
            Arguments.of("qwen2.5-coder:7b-base", "[\"completion\",\"insert\"]", fim, false),
            Arguments.of("qwen2.5-coder:3b-base", "[\"completion\",\"insert\"]", fim, false),
            Arguments.of("qwen3:8b", "[\"completion\",\"tools\",\"thinking\"]", chatml, true),
            Arguments.of("qwen3:14b", "[\"completion\",\"tools\",\"thinking\"]", chatml, true),
            Arguments.of("qwen2.5:7b-instruct", "[\"completion\",\"tools\"]", chatml, true),
            Arguments.of("qwen2.5:14b-instruct", "[\"completion\",\"tools\"]", chatml, true),
            // Son gabarit, rendu par Ollama lui-même, ne nomme pas les messages : ses outils disent qu'il converse.
            Arguments.of("qwen3.5:9b", "[\"completion\",\"vision\",\"tools\",\"thinking\"]", "", true),
            // Un modèle de conversation sans outils : c'est son gabarit qui le dit.
            Arguments.of("llama2", "[\"completion\"]", "[INST] <<SYS>>{{ .System }}<</SYS>> {{ .Prompt }} [/INST]", true));
    }

    @Test
    @DisplayName("la fiche de mimo-v2.6:9b (16/11/2026) : sa famille et son analyseur disent le Qwen3.5 que son nom tait")
    void theCardOfMimo() throws Exception {
        ModelGateway.ModelCard card = OllamaProtocol.card(json(FakeOllama.MIMO_SHOW));

        assertThat(card).isEqualTo(new ModelGateway.ModelCard("9.0B", 262_144, true, "qwen35", true, null, "qwen3.5"));
        assertThat(OllamaProtocol.qwen3(card)).isTrue();
    }

    @ParameterizedTest(name = "famille {0}, analyseur {1} : {2}")
    @CsvSource(nullValues = "-", value = {
        // mimo-v2.6:9b et qwen3.5:9b le 16/11/2026.
        "qwen35,   qwen3.5,     true",
        "qwen35,   -,           true",
        "-,        qwen3.5,     true",
        "qwen3,    -,           true",
        "QWEN3MOE, qwen3-coder, true",
        // Qwen2 et Qwen2.5 ne raisonnent pas ; un autre modèle non plus pour Qwen.
        "qwen2,    -,           false",
        "llama,    -,           false",
        "gptoss,   harmony,     false",
        "-,        -,           false",
    })
    @DisplayName("un Qwen3 se reconnaît à sa famille ou à l'analyseur d'Ollama, quand son nom ne le dit pas")
    void aQwen3ByItsCard(String family, String parser, boolean qwen3) {
        assertThat(OllamaProtocol.qwen3(new ModelGateway.ModelCard(null, null, null, family, null, null, parser))).isEqualTo(qwen3);
    }

    @Test
    @DisplayName("sans fiche, ce n'est pas un Qwen3")
    void noCardIsNoQwen3() {
        assertThat(OllamaProtocol.qwen3(null)).isFalse();
        assertThat(OllamaProtocol.qwen3(ModelGateway.ModelCard.NONE)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("realCards")
    @DisplayName("un modèle sait-il converser ? ses capacités, puis son gabarit")
    void whoCanChat(String model, String capabilities, String template, boolean chat) throws Exception {
        String show = "{\"capabilities\":" + capabilities + ",\"template\":\"" + template.replace("\"", "\\\"") + "\"}";

        assertThat(OllamaProtocol.card(json(show)).chat()).isEqualTo(chat);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"qwen3:14b, 10950000000, 6120000000", "qwen3:8b, 0, 0"})
    @DisplayName("où tient un modèle chargé se lit dans /api/ps ; pas chargé, rien")
    void whereAModelSits(String model, long memory, long gpu) throws Exception {
        JsonNode ps = json("{\"models\":[{\"name\":\"qwen3:14b\",\"model\":\"qwen3:14b\",\"size\":10950000000,\"size_vram\":6120000000}]}");

        assertThat(OllamaProtocol.loaded(ps, model)).isEqualTo(new ModelGateway.LoadedModel(memory, gpu));
    }

    @org.junit.jupiter.api.Test
    @DisplayName("la requête qui charge : aucun message, la fenêtre demandée")
    void theLoadRequest() {
        com.fasterxml.jackson.databind.node.ObjectNode request = OllamaProtocol.loadRequest(new com.fasterxml.jackson.databind.ObjectMapper(), "qwen3:8b", 16_384);

        assertThat(request.path("model").asText()).isEqualTo("qwen3:8b");
        assertThat(request.path("messages")).isEmpty();
        assertThat(request.path("options").path("num_ctx").asInt()).isEqualTo(16_384);
        assertThat(request.path("stream").asBoolean(true)).isFalse();
    }

    @org.junit.jupiter.api.Test
    @DisplayName("la place sur le disque de chaque modèle se lit dans /api/tags")
    void theDiskSizes() throws Exception {
        assertThat(OllamaProtocol.diskSizes(json("{\"models\":[{\"name\":\"qwen3:14b\",\"size\":9276198565},{\"name\":\"\",\"size\":1},{\"name\":\"nope\"}]}")))
            .containsOnly(org.assertj.core.api.Assertions.entry("qwen3:14b", 9_276_198_565L));
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

    static Stream<Arguments> requests() throws Exception {
        ModelGateway.ModelCard mimo = OllamaProtocol.card(json(FakeOllama.MIMO_SHOW));
        ModelGateway.ModelCard llama = OllamaProtocol.card(json("{\"details\":{\"family\":\"llama\"},\"capabilities\":[\"completion\",\"tools\"]}"));
        return Stream.of(
            Arguments.of("qwen3:8b", ModelGateway.ModelCard.NONE, false, false, "hi /no_think", false),
            Arguments.of("qwen3:8b", ModelGateway.ModelCard.NONE, true, false, "hi", null),
            Arguments.of("llama3.1:8b", ModelGateway.ModelCard.NONE, false, true, "hi", null),
            Arguments.of("llama3.1:8b", llama, false, false, "hi", null),
            // Un Qwen3.5 sous un autre nom : sa fiche le dit, le réglage natif suffit, sans directive dans son texte.
            Arguments.of(FakeOllama.MIMO, mimo, false, false, "hi", false),
            Arguments.of(FakeOllama.MIMO, mimo, false, true, "hi", false),
            Arguments.of(FakeOllama.MIMO, mimo, true, false, "hi", null),
            // Sans fiche lisible, son nom ne dit rien : il raisonne, comme avant.
            Arguments.of(FakeOllama.MIMO, ModelGateway.ModelCard.NONE, false, false, "hi", null));
    }

    @ParameterizedTest(name = "{0}, raisonnement {2}, JSON {3}")
    @MethodSource("requests")
    @DisplayName("la requête : sans flux, la température dans les options, Qwen3 sans raisonnement, le mode JSON")
    void request(String model, ModelGateway.ModelCard card, boolean think, boolean jsonMode, String lastMessage, Boolean thinkField) {
        ObjectNode body = OllamaProtocol.request(JSON, List.of(Map.of("role", "user", "content", "hi")), model, card, think,
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
