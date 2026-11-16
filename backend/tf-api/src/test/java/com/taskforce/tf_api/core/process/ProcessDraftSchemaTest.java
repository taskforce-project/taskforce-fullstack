package com.taskforce.tf_api.core.process;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Le schéma de sortie d'un brouillon (ADR-027, point 10) : le processus d'E20 en est un brouillon valide, une forme
 * fausse ne l'est pas, et le schéma n'emploie que les mots-clés que les sorties structurées des modèles savent tenir.
 * Le schéma se lit avec un petit lecteur écrit ici, pour ces seuls mots-clés : aucune bibliothèque de plus.
 */
@DisplayName("Le schéma de sortie d'un brouillon de processus")
class ProcessDraftSchemaTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> KEYWORDS = Set.of("$schema", "$id", "$defs", "$ref", "title", "description", "type",
        "properties", "required", "additionalProperties", "items", "enum", "const", "anyOf", "minItems", "maxItems",
        "minimum", "maximum", "minLength", "maxLength", "pattern");

    private static ObjectNode draft(ProcessModel model) {
        ObjectNode draft = JSON.createObjectNode();
        draft.set("process", JSON.valueToTree(model));
        draft.putArray("questions");
        draft.putArray("leftOut");
        return draft;
    }

    @Test
    @DisplayName("le processus d'E20, en brouillon, suit le schéma")
    void e20_is_a_valid_draft() {
        ObjectNode draft = draft(ProcessFixtures.integrateAModule());
        ObjectNode question = ((ArrayNode) draft.get("questions")).addObject();
        question.put("id", "client-tester").put("text", "Who tests the module at the client's?").put("answer", "text");
        ObjectNode left = ((ArrayNode) draft.get("leftOut")).addObject();
        left.put("stage", "deliver").put("reason", "A small module needs no week of watching.");
        left.set("step", ProcessValidatorTest.step((ObjectNode) draft.get("process"), "watch").deepCopy());

        assertThat(errors(draft)).isEmpty();
    }

    @Test
    @DisplayName("une forme fausse ne suit pas le schéma")
    void a_wrong_shape_is_not_a_draft() {
        ObjectNode unknownType = draft(ProcessFixtures.integrateAModule());
        ProcessValidatorTest.step((ObjectNode) unknownType.get("process"), "write-scope").put("type", "inclusive");
        ObjectNode agentOutside = draft(ProcessFixtures.integrateAModule());
        ObjectNode zone = ProcessValidatorTest.step((ObjectNode) agentOutside.get("process"), "spec-zone");
        zone.put("type", "agent").remove("steps");
        ObjectNode longList = draft(ProcessFixtures.integrateAModule());
        ArrayNode lines = (ArrayNode) ProcessValidatorTest.step((ObjectNode) longList.get("process"), "before-mission")
            .get("human").get("checklist");
        for (int i = 0; i < 5; i++) {
            lines.add("One more line.");
        }
        ObjectNode code = draft(ProcessFixtures.integrateAModule());
        ((ObjectNode) ProcessValidatorTest.flow((ObjectNode) code.get("process"), "go-ahead-specify").get("condition"))
            .put("expression", "${scopeApproved}");

        assertThat(errors(unknownType)).isNotEmpty();
        assertThat(errors(agentOutside)).isNotEmpty();
        assertThat(errors(longList)).isNotEmpty();
        assertThat(errors(code)).isNotEmpty();
    }

    @Test
    @DisplayName("le schéma n'emploie que des mots-clés que les sorties structurées tiennent")
    void only_portable_keywords() {
        List<String> used = new ArrayList<>();
        keywords(ProcessDraftSchema.json(), used);

        assertThat(used).isNotEmpty().allMatch(KEYWORDS::contains, "a keyword structured outputs support");
    }

    /** Les mots-clés d'un schéma et de tous ceux qu'il contient. */
    private static void keywords(JsonNode schema, List<String> out) {
        if (!schema.isObject()) {
            return;
        }
        schema.fieldNames().forEachRemaining(out::add);
        for (String map : List.of("properties", "$defs")) {
            if (schema.has(map)) {
                schema.get(map).forEach(s -> keywords(s, out));
            }
        }
        if (schema.has("items")) {
            keywords(schema.get("items"), out);
        }
        if (schema.has("anyOf")) {
            schema.get("anyOf").forEach(s -> keywords(s, out));
        }
    }

    // ------------------------------------------------------------------------------------------------- le lecteur

    private static List<String> errors(JsonNode instance) {
        JsonNode schema = ProcessDraftSchema.json();
        List<String> out = new ArrayList<>();
        validate(schema, schema, instance, "$", out);
        return out;
    }

    private static void validate(JsonNode root, JsonNode schema, JsonNode value, String at, List<String> out) {
        if (schema.has("$ref")) {
            String ref = schema.get("$ref").asText();
            validate(root, root.at(ref.substring(1)), value, at, out);
            return;
        }
        if (schema.has("anyOf")) {
            boolean any = false;
            for (JsonNode option : schema.get("anyOf")) {
                List<String> inner = new ArrayList<>();
                validate(root, option, value, at, inner);
                any |= inner.isEmpty();
            }
            if (!any) {
                out.add(at + ": matches none of its forms");
            }
        }
        if (schema.has("const") && !schema.get("const").equals(value)) {
            out.add(at + ": must be " + schema.get("const"));
        }
        if (schema.has("enum")) {
            boolean found = false;
            for (JsonNode e : schema.get("enum")) {
                found |= e.equals(value);
            }
            if (!found) {
                out.add(at + ": not one of " + schema.get("enum"));
            }
        }
        if (schema.has("type") && !typed(schema.get("type").asText(), value)) {
            out.add(at + ": must be " + schema.get("type").asText());
            return;
        }
        if (value.isTextual()) {
            String s = value.asText();
            if (schema.has("minLength") && s.length() < schema.get("minLength").asInt()) {
                out.add(at + ": too short");
            }
            if (schema.has("maxLength") && s.length() > schema.get("maxLength").asInt()) {
                out.add(at + ": too long");
            }
            if (schema.has("pattern") && !Pattern.compile(schema.get("pattern").asText()).matcher(s).find()) {
                out.add(at + ": doesn't match " + schema.get("pattern").asText());
            }
        }
        if (value.isNumber()) {
            if (schema.has("minimum") && value.asDouble() < schema.get("minimum").asDouble()) {
                out.add(at + ": too small");
            }
            if (schema.has("maximum") && value.asDouble() > schema.get("maximum").asDouble()) {
                out.add(at + ": too large");
            }
        }
        if (value.isArray()) {
            if (schema.has("minItems") && value.size() < schema.get("minItems").asInt()) {
                out.add(at + ": too few items");
            }
            if (schema.has("maxItems") && value.size() > schema.get("maxItems").asInt()) {
                out.add(at + ": too many items");
            }
            if (schema.has("items")) {
                for (int i = 0; i < value.size(); i++) {
                    validate(root, schema.get("items"), value.get(i), at + "[" + i + "]", out);
                }
            }
        }
        if (value.isObject()) {
            if (schema.has("required")) {
                for (JsonNode r : schema.get("required")) {
                    if (!value.has(r.asText())) {
                        out.add(at + ": " + r.asText() + " is missing");
                    }
                }
            }
            JsonNode props = schema.path("properties");
            Iterator<Map.Entry<String, JsonNode>> fields = value.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> f = fields.next();
                if (props.has(f.getKey())) {
                    validate(root, props.get(f.getKey()), f.getValue(), at + "." + f.getKey(), out);
                } else if (schema.path("additionalProperties").isBoolean() && !schema.get("additionalProperties").asBoolean()) {
                    out.add(at + ": " + f.getKey() + " isn't allowed");
                }
            }
        }
    }

    private static boolean typed(String type, JsonNode value) {
        return switch (type) {
            case "object" -> value.isObject();
            case "array" -> value.isArray();
            case "string" -> value.isTextual();
            case "integer" -> value.isIntegralNumber();
            case "number" -> value.isNumber();
            case "boolean" -> value.isBoolean();
            default -> false;
        };
    }
}
