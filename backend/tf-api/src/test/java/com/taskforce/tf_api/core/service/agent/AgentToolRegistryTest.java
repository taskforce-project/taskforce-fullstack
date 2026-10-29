package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.taskforce.tf_api.core.service.agent.tools.CreateIssueTool;
import com.taskforce.tf_api.core.service.agent.tools.CreateNoteTool;
import com.taskforce.tf_api.core.service.agent.tools.CreateProjectTool;
import com.taskforce.tf_api.core.service.agent.tools.FindIntegrationTool;
import com.taskforce.tf_api.core.service.agent.tools.ListIssuesTool;
import com.taskforce.tf_api.core.service.agent.tools.ListProjectsTool;
import com.taskforce.tf_api.core.service.agent.tools.SearchBrainTool;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Les définitions d'outils telles qu'elles partent au modèle, après l'allègement. Le 29/10/2026, la recette a montré que
 * {@code create_issue} partait avec un paramètre {@code title} devenu du texte : Ollama et Groq refusaient la requête,
 * et Cortex répondait sans aucun outil. Aucun test ne le voyait : ceux d'{@code AgentService} simulent le registre.
 */
@DisplayName("AgentToolRegistry")
class AgentToolRegistryTest {

    /** Les sept outils internes ; leurs schémas ne touchent pas aux services, d'où les dépendances nulles. */
    static Stream<Arguments> internalTools() {
        return Stream.<AgentTool>of(new CreateIssueTool(null), new CreateNoteTool(null), new CreateProjectTool(null),
                new FindIntegrationTool(null), new ListIssuesTool(null), new ListProjectsTool(null),
                new SearchBrainTool(null))
            .map(tool -> Arguments.of(tool.name(), tool));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("internalTools")
    @DisplayName("chaque outil interne part avec un schéma valide et tous ses paramètres")
    void internalToolDefinitionsAreValid(String name, AgentTool tool) {
        Map<String, Object> parameters = parametersOf(new AgentToolRegistry(List.of(tool)).toolDefinitions().get(0));

        assertThat(schemaErrors(parameters, "")).isEmpty();
        assertThat(properties(parameters).keySet())
            .containsExactlyInAnyOrderElementsOf(properties(tool.parametersSchema()).keySet());
        assertThat(properties(parameters).keySet()).containsAll(required(parameters));
    }

    @Test
    @DisplayName("régression : le paramètre title de create_issue reste un schéma de texte")
    void createIssueKeepsItsTitleParameter() {
        Map<String, Object> parameters = parametersOf(
            new AgentToolRegistry(List.of(new CreateIssueTool(null))).toolDefinitions().get(0));

        assertThat(properties(parameters).get("title")).isInstanceOf(Map.class);
        assertThat(asMap(properties(parameters).get("title"))).containsEntry("type", "string");
        assertThat(asMap(properties(parameters).get("description"))).containsEntry("type", "string");
    }

    @ParameterizedTest(name = "paramètre « {0} »")
    @ValueSource(strings = {"title", "description", "examples", "example", "$schema", "enum", "type", "properties"})
    @DisplayName("un paramètre externe nommé comme un mot-clé reste un paramètre")
    void parameterNamedLikeAKeywordStays(String name) {
        Map<String, Object> schema = Map.of(
            "type", "object",
            "properties", Map.of(name, Map.of("type", "string", "description", "A value")),
            "required", List.of(name));

        Map<String, Object> parameters = parametersOf(external(schema));

        assertThat(schemaErrors(parameters, "")).isEmpty();
        assertThat(asMap(properties(parameters).get(name))).containsEntry("type", "string");
    }

    @Test
    @DisplayName("les schémas imbriqués et les tableaux gardent leurs noms de paramètres")
    void nestedSchemasKeepTheirNames() {
        Map<String, Object> schema = Map.of(
            "type", "object",
            "properties", Map.of(
                "filter", Map.of("type", "object", "title", "Filter", "properties", Map.of(
                    "title", Map.of("type", "string"),
                    "description", Map.of("type", "string"))),
                "labels", Map.of("type", "array", "items", Map.of("type", "object", "properties", Map.of(
                    "description", Map.of("type", "string"))))),
            "$defs", Map.of("title", Map.of("type", "string")));

        Map<String, Object> parameters = parametersOf(external(schema));

        assertThat(schemaErrors(parameters, "")).isEmpty();
        Map<String, Object> filter = asMap(properties(parameters).get("filter"));
        assertThat(filter).containsEntry("title", "Filter");
        assertThat(properties(filter).keySet()).containsExactlyInAnyOrder("title", "description");
        assertThat(asMap(asMap(parameters.get("$defs")).get("title"))).containsEntry("type", "string");
    }

    @Test
    @DisplayName("l'allègement des mots-clés tient : textes tronqués, exemples retirés, enum borné")
    void keywordsAreStillTrimmed() {
        Map<String, Object> property = new LinkedHashMap<>();
        property.put("type", "string");
        property.put("description", "x".repeat(300));
        property.put("examples", List.of("a", "b"));
        property.put("enum", IntStream.range(0, 30).mapToObj(i -> "v" + i).toList());
        Map<String, Object> schema = Map.of(
            "$schema", "https://json-schema.org/draft/2020-12/schema",
            "type", "object",
            "properties", Map.of("status", property));

        Map<String, Object> parameters = parametersOf(external(schema));

        assertThat(parameters).doesNotContainKey("$schema");
        Map<String, Object> status = asMap(properties(parameters).get("status"));
        assertThat((String) status.get("description")).hasSize(161).endsWith("…");
        assertThat(status).doesNotContainKey("examples");
        assertThat((List<?>) status.get("enum")).hasSize(20);
    }

    // -------------------------------------------------------------------------
    // Les règles du métaschéma JSON Schema 2020-12 pour les mots-clés que portent nos outils, celles qu'Ollama et
    // Groq appliquent (« at '/properties/title': got string, want boolean or object »), sans dépendance de plus.
    // -------------------------------------------------------------------------

    private static final Set<String> TYPES = Set.of("object", "array", "string", "integer", "number", "boolean", "null");

    private static List<String> schemaErrors(Object node, String path) {
        List<String> errors = new ArrayList<>();
        if (node instanceof Boolean) return errors;
        if (!(node instanceof Map<?, ?> schema)) {
            errors.add(path + ": got " + node + ", want boolean or object");
            return errors;
        }
        Object type = schema.get("type");
        boolean validType = type == null || (type instanceof String t && TYPES.contains(t))
            || (type instanceof List<?> l && !l.isEmpty() && l.stream().allMatch(TYPES::contains));
        if (!validType) errors.add(path + "/type: got " + type + ", want a JSON Schema type");
        for (String text : List.of("title", "description")) {
            if (schema.containsKey(text) && !(schema.get(text) instanceof String)) {
                errors.add(path + "/" + text + ": want string");
            }
        }
        for (String named : List.of("properties", "patternProperties", "$defs", "definitions")) {
            Object value = schema.get(named);
            if (value == null) continue;
            if (value instanceof Map<?, ?> map) {
                map.forEach((name, sub) -> errors.addAll(schemaErrors(sub, path + "/" + named + "/" + name)));
            } else {
                errors.add(path + "/" + named + ": want object");
            }
        }
        for (String single : List.of("items", "additionalProperties")) {
            if (schema.containsKey(single)) errors.addAll(schemaErrors(schema.get(single), path + "/" + single));
        }
        Object required = schema.get("required");
        if (required != null && !(required instanceof List<?> l && l.stream().allMatch(String.class::isInstance))) {
            errors.add(path + "/required: want array of strings");
        }
        if (schema.containsKey("enum") && !(schema.get("enum") instanceof List<?>)) {
            errors.add(path + "/enum: want array");
        }
        return errors;
    }

    // -------------------------------------------------------------------------

    private static Map<String, Object> parametersOf(Map<String, Object> definition) {
        return asMap(asMap(definition.get("function")).get("parameters"));
    }

    private static Map<String, Object> parametersOf(AgentTool external) {
        return parametersOf(new AgentToolRegistry(List.of()).toolDefinitions(List.of(external)).get(0));
    }

    private static Map<String, Object> properties(Map<String, Object> schema) {
        Object value = schema.get("properties");
        return value == null ? Map.of() : asMap(value);
    }

    private static List<String> required(Map<String, Object> schema) {
        Object value = schema.get("required");
        return value == null ? List.of() : ((List<?>) value).stream().map(String::valueOf).toList();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    /** Un outil externe (serveur MCP) réduit à son schéma. */
    private static AgentTool external(Map<String, Object> schema) {
        return new AgentTool() {
            @Override public String name() { return "linear__save_issue"; }
            @Override public String description() { return "Save an issue in Linear"; }
            @Override public Map<String, Object> parametersSchema() { return schema; }
            @Override public String execute(Map<String, Object> args, AgentContext ctx) { return ""; }
        };
    }
}
